const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { app, BrowserWindow } = require('electron')

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'clover-api-')))
require(path.join(__dirname, '..', 'out', 'main', 'index.js'))

const calls = [
  ['appInfo', 'window.clover.appInfo()'],
  ['settings.getAll', 'window.clover.settings.getAll()'],
  ['apps.list', 'window.clover.apps.list()'],
  ['calendar.listCalendars', 'window.clover.calendar.listCalendars()'],
  ['calendar.listOccurrences', 'window.clover.calendar.listOccurrences(0, Date.now())'],
  ['ai.getSettings', 'window.clover.ai.getSettings()'],
  ['ai.status', 'window.clover.ai.status()'],
  ['ai.listModels(ollama)', "window.clover.ai.listModels('ollama')"],
  ['ai.getMcpSettings', 'window.clover.ai.getMcpSettings()'],
  ['wallpaper.detectEngine', 'window.clover.wallpaper.detectEngine()'],
  ['mail.listAccounts', 'window.clover.mail.listAccounts()'],
  ['mail.listSnippets', 'window.clover.mail.listSnippets()'],
  ['mail.listSavedSearches', 'window.clover.mail.listSavedSearches()'],
  ['mail.listLabels', 'window.clover.mail.listLabels()'],
  ['mail.listScheduled', 'window.clover.mail.listScheduled()'],
  ['mail.search', "window.clover.mail.search('hello')"],
  ['mail.listAliases(no-acct)', "window.clover.mail.listAliases('nope')"],
  ['mail.getDefaultFrom(none)', "window.clover.mail.getDefaultFrom('nope')"],
  ['mail.listFolders(none)', "window.clover.mail.listFolders('nope')"],
  ['dictation.supported', 'window.clover.dictation.supported()'],
  ['update.check', 'window.clover.update.check()']
]

app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 60 && !win; i += 1) {
    win = BrowserWindow.getAllWindows()[0] ?? null
    if (!win) await new Promise((r) => setTimeout(r, 100))
  }
  if (!win) {
    console.log('API NO_WINDOW')
    app.exit(1)
    return
  }
  await new Promise((r) => setTimeout(r, 1500))
  const results = []
  for (const [name, expr] of calls) {
    try {
      const value = await win.webContents.executeJavaScript(`(async () => { try { const v = await (${expr}); return { ok: true, type: Array.isArray(v) ? 'array[' + v.length + ']' : typeof v } } catch (e) { return { ok: false, error: String((e && e.message) || e) } } })()`)
      results.push({ name, ...value })
    } catch (error) {
      results.push({ name, ok: false, error: String(error && error.message) })
    }
  }
  const failed = results.filter((r) => !r.ok)
  console.log('API_RESULTS ' + JSON.stringify(results))
  console.log('API_FAILED ' + failed.length)
  app.exit(0)
})
