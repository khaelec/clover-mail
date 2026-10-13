const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { app, BrowserWindow } = require('electron')

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'clover-host-')))
require(path.join(__dirname, '..', 'out', 'main', 'index.js'))

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const MEASURE = `(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), x: Math.round(b.left), y: Math.round(b.top) } }
  const host = document.querySelector('[data-clover-apphost]')
  const slots = [...document.querySelectorAll('[data-clover-appslot]')]
  const wv = host ? host.querySelector('webview') : null
  return { host: r(host), hostMode: host ? host.getAttribute('data-clover-apphost') : null, slots: slots.map(r), webview: r(wv) }
})()`

app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 60 && !win; i += 1) {
    win = BrowserWindow.getAllWindows()[0] ?? null
    if (!win) await wait(100)
  }
  if (!win) {
    console.log('HOST NO_WINDOW')
    app.exit(1)
    return
  }
  await wait(1500)

  await win.webContents.executeJavaScript(`(async () => {
    await window.clover.mail.createAccount({ email: 'host@test.local', password: 'p', incoming: { host: 'imap.example.com', port: 993, security: 'ssl', username: 'host@test.local' }, outgoing: { host: 'smtp.example.com', port: 465, security: 'ssl', username: 'host@test.local' } })
    await window.clover.apps.create({ url: 'https://example.com' })
  })()`)

  // Reload so the renderer re-initialises with the new account + app.
  win.webContents.reload()
  await wait(3500)

  const idle = await win.webContents.executeJavaScript(
    `(() => { const h = document.querySelector('[data-clover-apphost]'); return { webviews: h ? h.querySelectorAll('webview').length : -1, mode: h ? h.getAttribute('data-clover-apphost') : null } })()`
  )
  console.log('IDLE ' + JSON.stringify(idle))

  win.webContents.send('app:navigate', 'apps')
  await wait(3000)
  console.log('APPS_MEASURE ' + JSON.stringify(await win.webContents.executeJavaScript(MEASURE)))

  win.webContents.send('app:navigate', 'mail')
  await wait(2000)
  const clicked = await win.webContents.executeJavaScript(
    `(() => { const b = document.querySelector('[title="Open app beside the reader"]'); if (b) b.click(); return !!b })()`
  )
  console.log('dock toggle clicked: ' + clicked)
  await wait(3000)
  console.log('DOCK_MEASURE ' + JSON.stringify(await win.webContents.executeJavaScript(MEASURE)))

  const { webContents } = require('electron')
  const guests = webContents.getAllWebContents().filter((c) => c.getType() === 'webview')
  for (const guest of guests) {
    try {
      const info = await guest.executeJavaScript(
        '({ w: window.innerWidth, h: window.innerHeight, dpr: devicePixelRatio, vw: window.visualViewport ? Math.round(window.visualViewport.width) + "x" + Math.round(window.visualViewport.height) : null, ua: navigator.userAgent.slice(0, 40) })'
      )
      console.log('GUEST ' + JSON.stringify(info))
    } catch (error) {
      console.log('GUEST_ERR ' + (error && error.message))
    }
  }

  app.exit(0)
})
