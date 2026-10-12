const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { app, BrowserWindow } = require('electron')

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'clover-ai-')))
require(path.join(__dirname, '..', 'out', 'main', 'index.js'))

app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 60 && !win; i += 1) {
    win = BrowserWindow.getAllWindows()[0] ?? null
    if (!win) await new Promise((r) => setTimeout(r, 100))
  }
  if (!win) {
    console.log('AI_TEST NO_WINDOW')
    app.exit(1)
    return
  }
  await new Promise((r) => setTimeout(r, 1000))
  try {
    const result = await win.webContents.executeJavaScript(`(async () => {
      const status = await window.clover.ai.status()
      return {
        opencodeAvailable: status.opencodeAvailable,
        opencodeModels: status.opencodeModels.length,
        sample: status.opencodeModels.slice(0, 3),
        viaListModels: (await window.clover.ai.listModels('opencode')).length
      }
    })()`)
    console.log('AI_TEST ' + JSON.stringify(result))
  } catch (error) {
    console.log('AI_TEST_ERROR ' + (error && error.message))
  }
  app.exit(0)
})
