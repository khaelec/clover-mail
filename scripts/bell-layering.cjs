// Regression test for the notification panel's stacking: opening the bell must
// paint the panel above the mail view (it used to be trapped in the title bar's
// backdrop-blur stacking context). Boots the real built main on a scratch profile
// and hit-tests the panel centre with document.elementFromPoint.
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { app, BrowserWindow } = require('electron')

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'clover-bell-')))
require(path.join(__dirname, '..', 'out', 'main', 'index.js'))

app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 80 && !win; i += 1) {
    win = BrowserWindow.getAllWindows()[0] ?? null
    if (!win) await new Promise((r) => setTimeout(r, 100))
  }
  if (!win) {
    console.log('BELL_LAYERING NO_WINDOW')
    app.exit(1)
    return
  }
  await new Promise((r) => setTimeout(r, 1800))

  let out
  try {
    out = JSON.parse(
      await win.webContents.executeJavaScript(`(async () => {
        const btn = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Notifications')
        if (!btn) return JSON.stringify({ error: 'no bell button' })
        btn.click()
        await new Promise((r) => setTimeout(r, 300))
        const panel = [...document.querySelectorAll('div')].find((d) => typeof d.className === 'string' && d.className.includes('z-[100]'))
        if (!panel) return JSON.stringify({ error: 'no panel' })
        const rect = panel.getBoundingClientRect()
        const el = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
        return JSON.stringify({
          hasPanel: true,
          underHeader: !!panel.closest('header'),
          hitInsidePanel: !!(el && panel.contains(el))
        })
      })()`)
    )
  } catch (error) {
    console.log('BELL_LAYERING_FAIL ' + error.message)
    app.exit(1)
    return
  }

  const pass = out.hasPanel === true && out.underHeader === false && out.hitInsidePanel === true
  console.log('BELL_LAYERING_RESULT ' + JSON.stringify(out))
  console.log(pass ? 'BELL_LAYERING_OK' : 'BELL_LAYERING_FAIL')
  app.exit(pass ? 0 : 1)
})
