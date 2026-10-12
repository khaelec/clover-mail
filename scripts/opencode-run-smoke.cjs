const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { app, BrowserWindow } = require('electron')

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'clover-ocrun-')))
require(path.join(__dirname, '..', 'out', 'main', 'index.js'))

app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 60 && !win; i += 1) {
    win = BrowserWindow.getAllWindows()[0] ?? null
    if (!win) await new Promise((r) => setTimeout(r, 100))
  }
  if (!win) {
    console.log('OCRUN NO_WINDOW')
    app.exit(1)
    return
  }
  await new Promise((r) => setTimeout(r, 1000))
  try {
    const result = await win.webContents.executeJavaScript(`(async () => {
      const models = await window.clover.ai.listModels('opencode')
      const model = models.includes('opencode/big-pickle') ? 'opencode/big-pickle' : models[0]
      await window.clover.ai.setSettings({ provider: 'opencode', opencodeModel: model })
      const streamId = 'test-stream'
      return await new Promise((resolve) => {
        let text = ''
        let settled = false
        const off = window.clover.ai.onStream((event) => {
          if (event.streamId !== streamId) return
          if (event.type === 'delta') text += event.text || ''
          if (event.type === 'done') { if (!settled) { settled = true; off(); resolve({ ok: true, model, len: text.length, sample: text.slice(0, 120) }) } }
          if (event.type === 'error') { if (!settled) { settled = true; off(); resolve({ ok: false, model, error: event.error }) } }
        })
        window.clover.ai.chat({ provider: 'opencode', model, system: 'Reply with a single word.', messages: [{ role: 'user', content: 'Say hello.' }], streamId })
        setTimeout(() => { if (!settled) { settled = true; off(); resolve({ ok: false, model, error: 'timeout' }) } }, 90000)
      })
    })()`)
    console.log('OCRUN ' + JSON.stringify(result))
  } catch (error) {
    console.log('OCRUN_ERROR ' + (error && error.message))
  }
  app.exit(0)
})
