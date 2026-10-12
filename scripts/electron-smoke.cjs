const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')

const errors = []

// Minimal stand-ins for the channels the renderer touches on boot.
ipcMain.handle('settings:getAll', () => ({}))
ipcMain.handle('settings:get', () => undefined)
ipcMain.handle('settings:set', () => undefined)
ipcMain.handle('app:info', () => ({
  name: 'Clover Mail',
  version: '0.1.0',
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  platform: process.platform,
  userDataPath: app.getPath('userData')
}))
ipcMain.handle('window:is-maximized', () => false)
ipcMain.on('window:minimize', () => {})
ipcMain.on('window:toggle-maximize', () => {})
ipcMain.on('window:close', () => {})
ipcMain.handle('mail:list-accounts', () => [])

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'out', 'preload', 'index.js'),
      contextIsolation: true,
      sandbox: false
    }
  })

  win.webContents.on('console-message', (...args) => {
    const message = typeof args[1] === 'object' ? args[1].message : args[2]
    const level = typeof args[1] === 'object' ? args[1].level : args[1]
    if (level === 'error' || level === 3) errors.push('console: ' + message)
  })
  win.webContents.on('did-fail-load', (_e, code, desc) => errors.push('failload:' + code + desc))
  win.webContents.on('render-process-gone', (_e, d) => errors.push('gone:' + JSON.stringify(d)))

  try {
    await win.loadFile(path.join(__dirname, '..', 'out', 'renderer', 'index.html'))
    await new Promise((r) => setTimeout(r, 1500))
    const result = await win.webContents.executeJavaScript(`JSON.stringify({
      title: document.title,
      header: !!document.querySelector('header'),
      navButtons: document.querySelectorAll('nav button').length,
      theme: document.documentElement.dataset.theme,
      accent: document.documentElement.dataset.accent,
      hasBridge: typeof window.clover === 'object'
    })`)
    console.log('RENDERER_SMOKE ' + result)
  } catch (error) {
    console.log('RENDERER_SMOKE_FAIL ' + error.message)
  }

  console.log('ERRORS ' + JSON.stringify(errors))
  app.exit(errors.length ? 1 : 0)
})
