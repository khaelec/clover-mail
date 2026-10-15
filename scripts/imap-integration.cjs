// IMAP integration test against a local Dovecot (see .github/workflows/imap-integration.yml).
// Boots the real built main process on a throwaway userData, seeds messages with
// a raw imapflow client, then exercises the app: sync, server-side deletion
// (reconcile), folder creation, and move -> undo (no ghost).
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { app, BrowserWindow } = require('electron')
const { ImapFlow } = require('imapflow')

// CI runners can't set up the SUID sandbox helper; disable it for this test.
app.commandLine.appendSwitch('no-sandbox')

const testUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'clover-imap-'))
app.setPath('userData', testUserData)

require(path.join(__dirname, '..', 'out', 'main', 'index.js'))

const HOST = process.env.CLOVER_IMAP_HOST || '127.0.0.1'
const PORT = Number(process.env.CLOVER_IMAP_PORT || 143)
const USER = process.env.CLOVER_IMAP_USER || 'clovertest'
const PASS = process.env.CLOVER_IMAP_PASS || 'cloverpass'

function raw() {
  return new ImapFlow({
    host: HOST,
    port: PORT,
    secure: false,
    auth: { user: USER, pass: PASS },
    logger: false,
    emitLogs: false
  })
}

function rawMessage(subject, id) {
  return Buffer.from(
    [
      'From: Sender <sender@test.local>',
      `To: ${USER}@localhost`,
      `Subject: ${subject}`,
      `Message-ID: <${id}@test>`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Hello body'
    ].join('\r\n')
  )
}

async function waitForWindow() {
  let win = null
  for (let i = 0; i < 80 && !win; i += 1) {
    win = BrowserWindow.getAllWindows()[0] ?? null
    if (!win) await new Promise((r) => setTimeout(r, 100))
  }
  return win
}

app.whenReady().then(async () => {
  const win = await waitForWindow()
  if (!win) {
    console.log('IMAP_TEST NO_WINDOW')
    app.exit(1)
    return
  }
  await new Promise((r) => setTimeout(r, 1200))

  const out = {}
  try {
    // Seed three messages.
    const seed = raw()
    await seed.connect()
    await seed.append('INBOX', rawMessage('Test one', 't1'))
    await seed.append('INBOX', rawMessage('Test two', 't2'))
    await seed.append('INBOX', rawMessage('Test three', 't3'))
    await seed.logout()

    const setup = JSON.parse(
      await win.webContents.executeJavaScript(`(async () => {
        const api = window.clover.mail
        const acct = await api.createAccount({
          email: 'clovertest@localhost',
          displayName: 'Clover Test',
          password: ${JSON.stringify(PASS)},
          incoming: { host: ${JSON.stringify(HOST)}, port: ${PORT}, security: 'none', username: ${JSON.stringify(USER)} },
          outgoing: { host: ${JSON.stringify(HOST)}, port: 25, security: 'none', username: ${JSON.stringify(USER)} }
        })
        await api.syncAccount(acct.id)
        const folders = await api.listFolders(acct.id)
        const inbox = folders.find((f) => f.specialUse === 'inbox') || folders[0]
        const before = await api.listMessages(inbox.id, 100)
        await api.createFolder({ accountId: acct.id, name: 'CloverTest' })
        const folders2 = await api.listFolders(acct.id)
        const target = folders2.find((f) => f.name === 'CloverTest')
        return JSON.stringify({
          accountId: acct.id,
          inboxId: inbox.id,
          beforeCount: before.length,
          createdFolder: !!target,
          targetId: target ? target.id : null
        })
      })()`)
    )
    Object.assign(out, setup)
    out.seeded = setup.beforeCount === 3

    // Delete one on the server, then sync: reconcile must remove it.
    const del = raw()
    await del.connect()
    await del.mailboxOpen('INBOX')
    const uids = await del.search({ all: true }, { uid: true })
    await del.messageDelete([uids[0]], { uid: true })
    await del.logout()

    out.afterServerDelete = JSON.parse(
      await win.webContents.executeJavaScript(`(async () => {
        const api = window.clover.mail
        await api.syncAccount(${JSON.stringify(setup.accountId)})
        const m = await api.listMessages(${JSON.stringify(setup.inboxId)}, 100)
        return JSON.stringify({ count: m.length, firstId: m[0] ? m[0].id : null })
      })()`)
    ).count

    // Move one to the new folder, then undo: it should come back with no ghost.
    out.moveUndo = JSON.parse(
      await win.webContents.executeJavaScript(`(async () => {
        const api = window.clover.mail
        const m = await api.listMessages(${JSON.stringify(setup.inboxId)}, 100)
        const res = await api.bulkAction({ messageIds: [m[0].id], action: 'move', targetFolderId: ${JSON.stringify(setup.targetId)} })
        const movedTo = await api.listMessages(${JSON.stringify(setup.targetId)}, 100)
        const undo = res.undo || []
        const u = await api.undoMoves(undo)
        await api.syncAccount(${JSON.stringify(setup.accountId)})
        const back = await api.listMessages(${JSON.stringify(setup.inboxId)}, 100)
        const ghost = await api.listMessages(${JSON.stringify(setup.targetId)}, 100)
        return JSON.stringify({ moved: res.moved, movedCount: movedTo.length, restored: u.restored, backCount: back.length, ghostCount: ghost.length })
      })()`)
    )
  } catch (error) {
    console.log('IMAP_TEST_FAIL ' + error.message)
    app.exit(1)
    return
  }

  const pass =
    out.seeded === true &&
    out.createdFolder === true &&
    out.afterServerDelete === 2 &&
    out.moveUndo &&
    out.moveUndo.moved === 1 &&
    out.moveUndo.movedCount === 1 &&
    out.moveUndo.restored === 1 &&
    out.moveUndo.backCount === 2 &&
    out.moveUndo.ghostCount === 0

  console.log('IMAP_TEST_RESULT ' + JSON.stringify(out))
  console.log(pass ? 'IMAP_TEST_OK' : 'IMAP_TEST_FAIL')
  app.exit(pass ? 0 : 1)
})
