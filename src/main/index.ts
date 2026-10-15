import {
  app,
  dialog,
  powerMonitor,
  shell,
  BrowserWindow,
  Menu,
  net,
  Notification,
  protocol,
  session
} from 'electron'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { IpcChannels } from '@shared/channels'
import { initDatabase, closeDatabase } from '@core/db'
import { registerIpc } from '@main/ipc'
import { setStorageRoot } from '@core/mail/storage'
import { initMediaAllow, isMediaPathAllowed } from '@main/mediaAllow'
import { initLogging, logError, logLine } from '@core/log'
import { setAppsRoot } from '@main/apps'
import { stopAllIdle } from '@core/mail/idle'
import { initUpdater } from '@main/updater'
import { createTray } from '@main/tray'
import { clearDueSnoozes } from '@core/mail/snooze'
import { processOutbox } from '@core/mail/outbox'
import { syncAccount } from '@core/mail/sync'
import { resetAccountConnection } from '@core/mail/connection'
import { cleanOrphanAttachments } from '@core/mail/attachmentsCleanup'
import { listAccounts } from '@core/mail/accounts'
import { createMailEmit } from '@main/mail/events'
import { registerElectronPlatform } from '@main/platformElectron'
import { dueReminders, markReminded } from '@main/calendar/reminders'
import { syncAllCaldav } from '@main/calendar/caldav'
import { randomUUID } from 'node:crypto'
import { networkInterfaces } from 'node:os'
import { getSetting, setSetting } from '@core/settings'
import { startTransport, type TransportServer } from '@core/transport/server'

let mainWindow: BrowserWindow | null = null
let isQuitting = false
let syncAllAccounts = (): void => undefined
let lastFocusSync = 0
let transport: TransportServer | null = null

function lanUrl(port: number, token: string): string {
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        return `http://${net.address}:${port}/?token=${encodeURIComponent(token)}`
      }
    }
  }
  return `http://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`
}

// Serve the mail engine to the mobile client (Settings → Privacy → Mobile
// access). The phone opens the URL over the LAN; the token gates the API.
async function startMobileIfEnabled(): Promise<void> {
  if (getSetting('mobile.enabled') !== true) return
  let token = getSetting<string>('mobile.token')
  if (!token) {
    token = randomUUID()
    setSetting('mobile.token', token)
  }
  const port = Number(getSetting('mobile.port')) || 8787
  const url = lanUrl(port, token)
  try {
    transport = await startTransport({ port, token, serveDir: join(__dirname, '../renderer') })
    setSetting('mobile.url', url)
    logLine('mobile', `serving on ${url}`)
  } catch (error) {
    logError('mobile', error)
  }
}

// Launching the app again (e.g. from the desktop icon) should focus the running
// window instead of starting a second instance that fights over the database.
const isPrimaryInstance = app.requestSingleInstanceLock()
if (!isPrimaryInstance) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = mainWindow ?? BrowserWindow.getAllWindows()[0] ?? null
    if (!win) {
      createWindow()
      return
    }
    if (win.isMinimized()) win.restore()
    if (!win.isVisible()) win.show()
    win.focus()
  })
}

// Log any uncaught exception (to logs/main.log) and still surface it, so a
// missing listener somewhere is diagnosable instead of a silent crash.
process.on('uncaughtException', (error) => {
  logError('uncaught', error)
  try {
    dialog.showErrorBox('Clover Mail error', error.stack ?? String(error))
  } catch {
    // ignore
  }
})

const isWebUrl = (url: string): boolean => /^https?:\/\//i.test(url) || url.startsWith('mailto:')
const isNavigable = (url: string): boolean =>
  /^(https?:|file:|about:|devtools:|chrome-extension:|clover-media:|blob:|data:)/i.test(url)

// Quiet Chromium's internal networking noise (e.g. WebRTC STUN lookups from
// embedded apps that can't resolve stun*.google.com). Only FATAL errors log.
app.commandLine.appendSwitch('log-level', '3')

// Present a stable, browser-like user agent to embedded apps. The default adds an
// "Electron/x.y.z" token, which some sites (Messenger, WhatsApp Web) treat as an
// unknown/new browser and force a fresh sign-in. Keep it constant across releases.
app.userAgentFallback = app.userAgentFallback
  .replace(/\s*Electron\/[\d.]+/i, '')
  .replace(/\s{2,}/g, ' ')
  .trim()

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
    // Only serve files inside the user data folder, a folder the user picked, or
    // a discovered Wallpaper Engine asset — never an arbitrary local path.
    if (!isMediaPathAllowed(filePath)) {
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
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      backgroundThrottling: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  // Refresh mail whenever the window is focused, so the view is current — but not
  // more than once every 30s, so switching between windows doesn't stack full
  // syncs on top of the 3-minute timer.
  mainWindow.on('focus', () => {
    const now = Date.now()
    if (now - lastFocusSync < 30_000) return
    lastFocusSync = now
    syncAllAccounts()
  })
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

  // Every embedded-app webview gets our notification-capture preload and forced
  // secure settings, whatever the page or embedder asked for.
  mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    if (!/^https?:\/\//i.test(params.src)) {
      event.preventDefault()
      return
    }
    webPreferences.preload = join(__dirname, '../preload/app.js')
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true
    webPreferences.sandbox = true
    webPreferences.backgroundThrottling = false
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
  if (!isPrimaryInstance) return
  // Engine platform services (dialogs, shell, secret encryption) before any use.
  registerElectronPlatform()
  electronApp.setAppUserModelId('com.clovermail.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Only ever hand web URLs to the OS. Anything else (custom schemes, file paths)
  // is denied, which prevents Windows' "Get an app from the Store" popup.
  app.on('web-contents-created', (_event, contents) => {
    // Embedded apps (webviews) may open popups — printing, OAuth, media — so let
    // web/about:blank windows through. Everything else opens in the OS browser.
    contents.setWindowOpenHandler(({ url }) => {
      if (contents.getType() === 'webview') {
        if (url === 'about:blank' || /^https?:/i.test(url)) {
          return {
            action: 'allow',
            overrideBrowserWindowOptions: {
              width: 1024,
              height: 760,
              autoHideMenuBar: true,
              webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
                backgroundThrottling: false
              }
            }
          }
        }
        return { action: 'deny' }
      }
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
  initMediaAllow(app.getPath('userData'))
  initLogging(app.getPath('userData'))

  // A sleeping laptop leaves IMAP sockets dead; drop the pooled connections so
  // the next action reconnects instead of hanging until the socket times out.
  powerMonitor.on('resume', () => {
    for (const account of listAccounts()) resetAccountConnection(account.id)
  })
  setAppsRoot(app.getPath('userData'))
  registerIpc(
    () => mainWindow,
    () => {
      isQuitting = true
    }
  )
  createWindow()
  void startMobileIfEnabled()
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

  // Full sync of every account on startup and periodically. IMAP IDLE only
  // watches the inbox, so this is what keeps Sent/Drafts/other folders current
  // and picks up mail that arrived while the app was closed.
  const mailEmit = createMailEmit(() => mainWindow)
  syncAllAccounts = (): void => {
    for (const account of listAccounts()) {
      void syncAccount(account.id, mailEmit).catch(() => undefined)
    }
  }
  setTimeout(syncAllAccounts, 4_000)
  setInterval(syncAllAccounts, 3 * 60_000)

  // Wake snoozed messages when their time arrives.
  setInterval(() => {
    const due = clearDueSnoozes(Date.now())
    if (due.length > 0) {
      mainWindow?.webContents.send(IpcChannels.mail.events, { type: 'mail:refresh', accountId: '' })
    }
  }, 60_000)

  // Send queued/scheduled outbox messages when due (and retry recent failures).
  setInterval(() => {
    void processOutbox(Date.now()).then((sent) => {
      if (sent > 0) {
        mainWindow?.webContents.send(IpcChannels.mail.events, { type: 'mail:refresh', accountId: '' })
      }
    })
  }, 20_000)

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

  // Deliver anything left in the outbox from a previous session.
  setTimeout(() => void processOutbox(), 5_000)

  // Remove attachment files whose message is gone (scoped to the attachments
  // folder only; set CLOVER_ATTACH_CLEAN_DRYRUN=1 to log without deleting).
  setTimeout(() => {
    try {
      cleanOrphanAttachments(app.getPath('userData'))
    } catch {
      // best effort
    }
  }, 10_000)
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
  void transport?.close()
  closeDatabase()
})
