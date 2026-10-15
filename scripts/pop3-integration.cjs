const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const net = require('node:net')
const { app, BrowserWindow } = require('electron')

// Isolated data directory so this test never touches real accounts.
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'clover-pop3-')))

const MESSAGES = [
  'From: Alice <alice@example.com>\r\nTo: me@example.com\r\nSubject: Pop3 test one\r\nMessage-ID: <m1@example.com>\r\nDate: Mon, 01 Jan 2024 10:00:00 +0000\r\n\r\nHello one\r\n',
  'From: Bob <bob@example.com>\r\nTo: me@example.com\r\nSubject: Pop3 test two\r\nMessage-ID: <m2@example.com>\r\nDate: Tue, 02 Jan 2024 11:00:00 +0000\r\n\r\nHello two\r\n'
]

function startMockPop3() {
  const server = net.createServer((socket) => {
    socket.write('+OK mock POP3 ready\r\n')
    let buffer = ''
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      let idx
      while ((idx = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        const [cmd, arg] = line.split(/\s+/)
        const upper = (cmd || '').toUpperCase()
        if (upper === 'USER' || upper === 'PASS' || upper === 'DELE') {
          socket.write('+OK\r\n')
        } else if (upper === 'STAT') {
          socket.write(`+OK ${MESSAGES.length} 120\r\n`)
        } else if (upper === 'UIDL') {
          socket.write('+OK\r\n')
          MESSAGES.forEach((_, i) => socket.write(`${i + 1} uidl-${i + 1}\r\n`))
          socket.write('.\r\n')
        } else if (upper === 'RETR') {
          const n = Number(arg)
          const body = MESSAGES[n - 1] || ''
          socket.write('+OK\r\n')
          socket.write(body.replace(/\r\n/g, '\r\n'))
          if (!body.endsWith('\r\n')) socket.write('\r\n')
          socket.write('.\r\n')
        } else if (upper === 'QUIT') {
          socket.write('+OK bye\r\n')
          socket.end()
        } else {
          socket.write('+OK\r\n')
        }
      }
    })
    socket.on('error', () => undefined)
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

require(path.join(__dirname, '..', 'out', 'main', 'index.js'))

const errors = []

app.whenReady().then(async () => {
  const server = await startMockPop3()
  const port = server.address().port

  let win = null
  for (let i = 0; i < 60 && !win; i += 1) {
    win = BrowserWindow.getAllWindows()[0] ?? null
    if (!win) await new Promise((r) => setTimeout(r, 100))
  }
  if (!win) {
    console.log('POP3_TEST NO_WINDOW')
    app.exit(1)
    return
  }

  win.webContents.on('console-message', (...args) => {
    const level = typeof args[1] === 'object' ? args[1].level : args[1]
    const message = typeof args[1] === 'object' ? args[1].message : args[2]
    if (level === 'error' || level === 3) errors.push('console: ' + message)
  })

  await new Promise((r) => setTimeout(r, 1200))

  // Write a small mbox for the import test.
  const mboxPath = path.join(app.getPath('userData'), 'sample.mbox')
  fs.writeFileSync(
    mboxPath,
    'From alice@example.com Mon Jan 01 10:00:00 2024\r\nFrom: Alice <alice@example.com>\r\nSubject: Mbox one\r\n\r\nBody one\r\n\r\n' +
      'From bob@example.com Tue Jan 02 11:00:00 2024\r\nFrom: Bob <bob@example.com>\r\nSubject: Mbox two\r\n\r\nBody two\r\n\r\n'
  )

  try {
    const result = await win.webContents.executeJavaScript(`(async () => {
      const api = window.clover.mail
      const created = await api.createAccount({
        email: 'pop3@clover.local',
        displayName: 'POP3 Test',
        password: 'secret',
        protocol: 'pop3',
        incoming: { host: '127.0.0.1', port: ${port}, security: 'none', username: 'pop3@clover.local' },
        outgoing: { host: 'smtp.example.com', port: 465, security: 'ssl', username: 'pop3@clover.local' }
      })
      await api.syncAccount(created.id)
      const folders = await api.listFolders(created.id)
      const inbox = folders.find((f) => f.specialUse === 'inbox')
      const messages = inbox ? await api.listMessages(inbox.id) : []
      const imported = await api.importMbox(${JSON.stringify(mboxPath)})
      const accounts = await api.listAccounts()
      const localMail = (await api.listFolders(imported.accountId)).find((f) => f.id === imported.folderId)
      const localMessages = localMail ? await api.listMessages(localMail.id) : []
      // Creating a folder on a local account must work without a server (#2).
      await api.createFolder({ accountId: imported.accountId, name: 'Local Folder' })
      const createdLocal = (await api.listFolders(imported.accountId)).some((f) => f.name === 'Local Folder')
      return {
        pop3Folders: folders.length,
        pop3Messages: messages.length,
        pop3Subjects: messages.map((m) => m.subject).sort(),
        mboxImported: imported.imported,
        mboxSkipped: imported.skipped,
        localMessages: localMessages.length,
        createdLocal,
        accountCount: accounts.length
      }
    })()`)
    console.log('POP3_MBOX_TEST ' + JSON.stringify(result))
  } catch (error) {
    console.log('POP3_MBOX_TEST_ERROR ' + (error && error.message))
  }

  console.log('ERRORS ' + JSON.stringify(errors))
  server.close()
  app.exit(0)
})
