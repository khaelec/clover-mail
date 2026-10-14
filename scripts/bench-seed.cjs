// Seed a large test mailbox into a SCRATCH profile for the list benchmark.
//
//   npm run bench:seed -- --user-data-dir=C:\path\to\scratch
//
// Refuses to run against the real Clover Mail profile (see bench-guard.cjs).
const path = require('node:path')
const fs = require('node:fs')
const { app, BrowserWindow } = require('electron')
const { resolveScratchDir } = require('./bench-guard.cjs')

const scratch = resolveScratchDir(app)
const COUNT = Number(process.env.CLOVER_BENCH_COUNT || 6000)

fs.rmSync(scratch, { recursive: true, force: true })
fs.mkdirSync(scratch, { recursive: true })
app.setPath('userData', scratch)

// Boot the real built main process against the scratch profile.
require(path.join(__dirname, '..', 'out', 'main', 'index.js'))

function buildMbox() {
  const out = []
  let i = 0
  let thread = 0
  while (i < COUNT) {
    // Every 50th message starts a longer conversation (5–20 messages); everything
    // else is a single-message thread. This exercises expand/collapse and the
    // Unread/Read split realistically.
    const length = i % 50 === 0 ? 5 + (thread % 16) : 1
    for (let k = 0; k < length && i < COUNT; k += 1, i += 1) {
      const date = new Date(Date.UTC(2024, 0, 1) + i * 60000).toUTCString()
      const headers = [
        `From: Sender ${i % 50} <sender${i % 50}@example.com>`,
        'To: bench@clover.local',
        `Subject: ${k === 0 ? `Benchmark thread ${thread}` : `Re: Benchmark thread ${thread}`}`,
        `Date: ${date}`,
        `Message-ID: <msg-${i}@bench>`
      ]
      if (k > 0) headers.push(`In-Reply-To: <msg-${i - 1}@bench>`)
      headers.push('MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', '', '')
      const body = `Body for message ${i}. ` + 'lorem ipsum dolor sit amet '.repeat(40) + '\n'
      out.push(`From sender${i % 50}@example.com ${date}\n${headers.join('\n')}${body}`)
    }
    thread += 1
  }
  return out.join('\n')
}

const mboxPath = path.join(scratch, 'bench.mbox')
fs.writeFileSync(mboxPath, buildMbox())

app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 120 && !win; i += 1) {
    win = BrowserWindow.getAllWindows()[0] ?? null
    if (!win) await new Promise((r) => setTimeout(r, 100))
  }
  if (!win) {
    console.log('SEED_RESULT NO_WINDOW')
    app.exit(1)
    return
  }
  await new Promise((r) => setTimeout(r, 1500))
  try {
    const started = Date.now()
    const result = await win.webContents.executeJavaScript(
      `window.clover.mail.importMbox(${JSON.stringify(mboxPath)}).then((r) => JSON.stringify(r))`
    )
    const { folderId } = JSON.parse(result)
    // Mark about half the messages read so the Unread/Read split (and its headers)
    // are exercised too.
    const marked = await win.webContents.executeJavaScript(`(async () => {
      const api = window.clover.mail
      const all = await api.listMessages(${JSON.stringify(folderId)}, 100000)
      const half = all.filter((_, idx) => idx % 2 === 0).map((m) => m.id)
      if (half.length) await api.bulkAction({ messageIds: half, action: 'markRead' })
      return half.length
    })()`)
    console.log(
      'SEED_RESULT ' + result + ' markedRead=' + marked + ' in ' + (Date.now() - started) + 'ms'
    )
  } catch (error) {
    console.log('SEED_FAIL ' + error.message)
  }
  app.exit(0)
})
