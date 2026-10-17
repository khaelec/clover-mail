import { BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { randomUUID } from 'node:crypto'
import { IpcChannels } from '@shared/channels'
import type { ComposeWindowPayload } from '@shared/ipc'
import { revealWindow } from '@main/mail/events'
import { attachEditMenu } from '@main/editMenu'

type MessageAction = 'reply' | 'replyAll' | 'forward'

// One window per message: double-clicking it again focuses the open one.
const windows = new Map<string, BrowserWindow>()
// Compose windows, and the message each one opens with until it picks it up.
const composeWindows = new Set<BrowserWindow>()
const composePayloads = new Map<string, ComposeWindowPayload>()

function refreshMain(getMain: () => BrowserWindow | null): void {
  getMain()?.webContents.send(IpcChannels.mail.events, { type: 'mail:refresh', accountId: '' })
}

/** A window running the app page with `hash`, cascaded from the main window. */
function createPopout(
  hash: string,
  size: { width: number; height: number },
  getMain: () => BrowserWindow | null
): BrowserWindow {
  const main = getMain()
  const [x, y] = main && !main.isDestroyed() ? main.getPosition() : [undefined, undefined]
  const offset = 60 + (windows.size + composeWindows.size) * 24
  const win = new BrowserWindow({
    ...size,
    minWidth: 520,
    minHeight: 420,
    // Cascade from the main window so it's obvious where it opened.
    ...(x !== undefined && y !== undefined ? { x: x + offset, y: y + offset } : {}),
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
  win.on('ready-to-show', () => win.show())
  // Spelling suggestions, cut/copy/paste — same as the main window.
  attachEditMenu(win)
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${hash}`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { hash })
  }
  return win
}

function openMessageWindow(messageId: string, getMain: () => BrowserWindow | null): void {
  const existing = windows.get(messageId)
  if (existing && !existing.isDestroyed()) {
    revealWindow(existing)
    return
  }
  const win = createPopout(`message=${encodeURIComponent(messageId)}`, { width: 900, height: 760 }, getMain)
  windows.set(messageId, win)
  win.on('closed', () => {
    windows.delete(messageId)
    // Reading or filing it there should show in the main list right away.
    refreshMain(getMain)
  })
}

// A saved draft opened in a window: opening it again focuses that window.
const draftWindows = new Map<string, BrowserWindow>()

function openComposeWindow(payload: ComposeWindowPayload, getMain: () => BrowserWindow | null): void {
  const draftKey = payload.draftUid ? `${payload.accountId}:${payload.draftUid}` : null
  const existing = draftKey ? draftWindows.get(draftKey) : undefined
  if (existing && !existing.isDestroyed()) {
    revealWindow(existing)
    return
  }
  const token = randomUUID()
  composePayloads.set(token, payload)
  const win = createPopout(`compose=${token}`, { width: 820, height: 760 }, getMain)
  composeWindows.add(win)
  if (draftKey) draftWindows.set(draftKey, win)
  win.on('closed', () => {
    composeWindows.delete(win)
    if (draftKey && draftWindows.get(draftKey) === win) draftWindows.delete(draftKey)
    composePayloads.delete(token)
    // Sent or saved there: show it in the main window's folders and Outbox.
    refreshMain(getMain)
  })
}

export function registerMessageWindowIpc(getMain: () => BrowserWindow | null): void {
  ipcMain.on(IpcChannels.appOpenMessageWindow, (_e, messageId: string) => {
    if (typeof messageId === 'string' && messageId) openMessageWindow(messageId, getMain)
  })
  // A pop-out changed something (read, flagged, moved): refresh the main list.
  ipcMain.on(IpcChannels.appMailChanged, () => refreshMain(getMain))
  ipcMain.on(IpcChannels.appOpenComposeWindow, (_e, payload: ComposeWindowPayload) => {
    if (payload && typeof payload.accountId === 'string') openComposeWindow(payload, getMain)
  })
  // Handed over once: the window keeps it from here.
  ipcMain.handle(IpcChannels.appTakeComposeWindow, (_e, token: string) => {
    const payload = composePayloads.get(token) ?? null
    composePayloads.delete(token)
    return payload
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
