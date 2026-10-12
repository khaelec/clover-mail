const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { app, BrowserWindow } = require('electron')

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'clover-dict-')))
require(path.join(__dirname, '..', 'out', 'main', 'index.js'))

app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 60 && !win; i += 1) {
    win = BrowserWindow.getAllWindows()[0] ?? null
    if (!win) await new Promise((r) => setTimeout(r, 100))
  }
  if (!win) {
    console.log('DICT NO_WINDOW')
    app.exit(1)
    return
  }
  await new Promise((r) => setTimeout(r, 1000))
  try {
    const result = await win.webContents.executeJavaScript(`(async () => {
      const supported = await window.clover.dictation.supported()
      const events = []
      const off = window.clover.dictation.onEvent((e) => events.push(e.type))
      const started = await window.clover.dictation.start()
      await new Promise((r) => setTimeout(r, 4000))
      window.clover.dictation.stop()
      off()
      return { supported, started, events }
    })()`)
    console.log('DICT ' + JSON.stringify(result))
  } catch (error) {
    console.log('DICT_ERROR ' + (error && error.message))
  }
  app.exit(0)
})
