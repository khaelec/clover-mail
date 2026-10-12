import { app, shell, BrowserWindow, Menu, net, Notification, protocol, session } from 'electron'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { IpcChannels } from '@shared/channels'
import { initDatabase, closeDatabase } from '@main/db'
import { registerIpc } from '@main/ipc'
import { setStorageRoot } from '@main/mail/storage'
import { setAppsRoot } from '@main/apps'
import { stopAllIdle } from '@main/mail/idle'
import { initUpdater } from '@main/updater'
import { createTray } from '@main/tray'
import { clearDueSnoozes } from '@main/mail/snooze'
import { processDueSends } from '@main/mail/schedules'
import { dueReminders, markReminded } from '@main/calendar/reminders'
import { syncAllCaldav } from '@main/calendar/caldav'

let mainWindow: BrowserWindow | null = null
let isQuitting = false

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
  'svg',
  'html',
  'htm',
  'pdf',
  'txt',
  'csv',
  'json',
  'md',
  'log',
  'xml',
  'eml'
])

// Privileged custom scheme so the renderer can load local wallpaper media safely.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'clover-media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true }
  }
])

// A personal build can ship a preconfigured database; seed it on first run only.
function seedDatabaseIfFirstRun(userData: string): void {
  const target = join(userData, 'clover-mail.db')
  if (existsSync(target)) return
  const seed = is.dev
    ? join(app.getAppPath(), 'seed', 'clover-mail.db')
    : join(process.resourcesPath, 'seed.db')
  if (!existsSync(seed)) return
  mkdirSync(userData, { recursive: true })
  copyFileSync(seed, target)
}

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

  // Close to tray instead of quitting.
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
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

app.whenReady().then(async () => {
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

  seedDatabaseIfFirstRun(app.getPath('userData'))
  initDatabase(app.getPath('userData'))
  setStorageRoot(app.getPath('userData'))
  setAppsRoot(app.getPath('userData'))
  registerIpc(() => mainWindow)
  createWindow()
  void initUpdater()
  createTray(
    () => mainWindow,
    () => {
      isQuitting = true
      app.quit()
    }
  )

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // Wake snoozed messages when their time arrives.
  setInterval(() => {
    const due = clearDueSnoozes(Date.now())
    if (due.length > 0) {
      mainWindow?.webContents.send(IpcChannels.mail.events, { type: 'mail:refresh', accountId: '' })
    }
  }, 60_000)

  // Send scheduled messages when due.
  setInterval(() => {
    void processDueSends(Date.now()).then((sent) => {
      if (sent > 0) {
        mainWindow?.webContents.send(IpcChannels.mail.events, { type: 'mail:refresh', accountId: '' })
      }
    })
  }, 30_000)

  // Event reminders shortly before they start.
  setInterval(() => {
    try {
      for (const reminder of dueReminders(Date.now())) {
        markReminded(reminder.eventId, reminder.startUtc)
        if (!Notification.isSupported()) continue
        const when = new Date(reminder.startUtc).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit'
        })
        const notification = new Notification({
          title: reminder.summary,
          body: `${when}${reminder.location ? ` · ${reminder.location}` : ''}`
        })
        notification.on('click', () => {
          mainWindow?.show()
          mainWindow?.webContents.send(IpcChannels.appNavigate, 'calendar')
        })
        notification.show()
      }
    } catch {
      // calendar may be empty; ignore
    }
  }, 30_000)

  // Pull-sync CalDAV calendars on startup and periodically.
  setTimeout(() => void syncAllCaldav(), 20_000)
  setInterval(() => void syncAllCaldav(), 15 * 60_000)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    closeDatabase()
    app.quit()
  }
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('will-quit', () => {
  stopAllIdle()
  closeDatabase()
})
