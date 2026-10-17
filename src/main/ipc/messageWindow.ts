import { BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { IpcChannels } from '@shared/channels'
import { revealWindow } from '@main/mail/events'

type MessageAction = 'reply' | 'replyAll' | 'forward'

// One window per message: double-clicking it again focuses the open one.
const windows = new Map<string, BrowserWindow>()

function openMessageWindow(messageId: string, getMain: () => BrowserWindow | null): void {
  const existing = windows.get(messageId)
  if (existing && !existing.isDestroyed()) {
    revealWindow(existing)
    return
  }
  const main = getMain()
  const [x, y] = main && !main.isDestroyed() ? main.getPosition() : [undefined, undefined]
  const win = new BrowserWindow({
    width: 900,
    height: 760,
    minWidth: 520,
    minHeight: 420,
    // Cascade from the main window so it's obvious where the message opened.
    ...(x !== undefined && y !== undefined ? { x: x + 60 + windows.size * 24, y: y + 60 + windows.size * 24 } : {}),
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b0f14',
    title: 'Clover Mail',
    ...(is.dev ? { icon: join(__dirname, '../../build/icon.ico') } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  windows.set(messageId, win)
  win.on('ready-to-show', () => win.show())
  win.on('closed', () => {
    windows.delete(messageId)
    // Reading or filing it there should show in the main list right away.
    getMain()?.webContents.send(IpcChannels.mail.events, { type: 'mail:refresh', accountId: '' })
  })
  const hash = `message=${encodeURIComponent(messageId)}`
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${hash}`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { hash })
  }
}

export function registerMessageWindowIpc(getMain: () => BrowserWindow | null): void {
  ipcMain.on(IpcChannels.appOpenMessageWindow, (_e, messageId: string) => {
    if (typeof messageId === 'string' && messageId) openMessageWindow(messageId, getMain)
  })
  // A pop-out changed something (read, flagged, moved): refresh the main list.
  ipcMain.on(IpcChannels.appMailChanged, () => {
    getMain()?.webContents.send(IpcChannels.mail.events, { type: 'mail:refresh', accountId: '' })
  })
  // Reply/forward from a pop-out are written in the main window.
  ipcMain.on(
    IpcChannels.appMessageAction,
    (_e, target: { accountId: string; messageId: string; threadId?: string; action: MessageAction }) => {
      const main = getMain()
      if (!main) return
      revealWindow(main)
      main.webContents.send(IpcChannels.appOpenMessage, target)
    }
  )
}
