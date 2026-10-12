import { app, shell, BrowserWindow, Menu, net, protocol, session } from 'electron'
import { extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { IpcChannels } from '@shared/channels'
import { initDatabase, closeDatabase } from '@main/db'
import { registerIpc } from '@main/ipc'
import { setStorageRoot } from '@main/mail/storage'
import { setAppsRoot } from '@main/apps'
import { stopAllIdle } from '@main/mail/idle'

let mainWindow: BrowserWindow | null = null

const isWebUrl = (url: string): boolean => /^https?:\/\//i.test(url) || url.startsWith('mailto:')
const isNavigable = (url: string): boolean =>
  /^(https?:|file:|about:|devtools:|chrome-extension:|clover-media:|blob:|data:)/i.test(url)

// Quiet Chromium's internal networking noise (e.g. WebRTC STUN lookups from
// embedded apps that can't resolve stun*.google.com). Only FATAL errors log.
app.commandLine.appendSwitch('log-level', '3')

const MEDIA_EXTENSIONS = new Set([
  'mp4',
  'webm',
  'mkv',
  'mov',
  'm4v',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'bmp',
  'avif',
  'html',
  'htm'
])

// Privileged custom scheme so the renderer can load local wallpaper media safely.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'clover-media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true }
  }
])

function registerMediaProtocol(): void {
  protocol.handle('clover-media', (request) => {
    const raw = new URL(request.url).searchParams.get('path')
    if (!raw) return new Response('Bad request', { status: 400 })
    const filePath = decodeURIComponent(raw)
    if (!MEDIA_EXTENSIONS.has(extname(filePath).slice(1).toLowerCase())) {
      return new Response('Forbidden', { status: 403 })
    }
    return net.fetch(pathToFileURL(filePath).toString())
  })
}

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
    ...(is.dev ? { icon: join(__dirname, '../../build/icon.ico') } : {}),
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
    if (/^https?:\/\//i.test(url) || url.startsWith('mailto:')) void shell.openExternal(url)
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

  // Only ever hand web URLs to the OS. Anything else (custom schemes, file paths)
  // is denied, which prevents Windows' "Get an app from the Store" popup.
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (isWebUrl(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })

    // Block top-level navigations to non-web schemes (steam://, ms-windows-store:, …)
    // so Chromium never hands them to the OS.
    contents.on('will-navigate', (event, url) => {
      if (!isNavigable(url)) event.preventDefault()
    })
    contents.on('will-redirect', (event, url) => {
      if (!isNavigable(url)) event.preventDefault()
    })
  })

  session.defaultSession.setSpellCheckerEnabled(true)
  session.defaultSession.setSpellCheckerLanguages(['en-US'])

  registerMediaProtocol()

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

app.on('will-quit', () => {
  stopAllIdle()
  closeDatabase()
})
