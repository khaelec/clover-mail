import { app, shell, BrowserWindow, Menu, session } from 'electron'
import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { IpcChannels } from '@shared/channels'
import { initDatabase, closeDatabase } from '@main/db'
import { registerIpc } from '@main/ipc'
import { setStorageRoot } from '@main/mail/storage'
import { setAppsRoot } from '@main/apps'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 620,
    show: false,
    frame: false,
    backgroundColor: '#0b0f14',
    title: 'Clover Mail',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('maximize', () =>
    mainWindow?.webContents.send(IpcChannels.windowMaximizedChanged, true)
  )
  mainWindow.on('unmaximize', () =>
    mainWindow?.webContents.send(IpcChannels.windowMaximizedChanged, false)
  )
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('context-menu', (_event, params) => {
    const template: Electron.MenuItemConstructorOptions[] = []
    if (params.misspelledWord) {
      for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
        template.push({
          label: suggestion,
          click: () => mainWindow?.webContents.replaceMisspelling(suggestion)
        })
      }
      if (template.length > 0) template.push({ type: 'separator' })
      template.push({
        label: `Add “${params.misspelledWord}” to dictionary`,
        click: () =>
          mainWindow?.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
      })
      template.push({ type: 'separator' })
    }
    if (params.isEditable) {
      template.push(
        { role: 'cut', enabled: params.editFlags.canCut },
        { role: 'copy', enabled: params.editFlags.canCopy },
        { role: 'paste', enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { role: 'selectAll' }
      )
    } else if (params.selectionText) {
      template.push({ role: 'copy' })
    }
    if (template.length > 0) Menu.buildFromTemplate(template).popup()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.clovermail.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  session.defaultSession.setSpellCheckerEnabled(true)
  session.defaultSession.setSpellCheckerLanguages(['en-US'])

  initDatabase(app.getPath('userData'))
  setStorageRoot(app.getPath('userData'))
  setAppsRoot(app.getPath('userData'))
  registerIpc(() => mainWindow)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    closeDatabase()
    app.quit()
  }
})

app.on('will-quit', () => closeDatabase())
