import { Notification, type BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/channels'
import { getSetting } from '@core/settings'
import type { MailEvent } from '@shared/mail'

export type Emit = (event: MailEvent) => void

// Electron drops a Notification's click handler once the JS object is garbage
// collected, so a toast clicked a few minutes later (or from the Windows Action
// Center) did nothing. Keep recent ones referenced.
const live = new Set<Notification>()
const MAX_LIVE = 30

/** Bring the main window to the front, restoring it from the tray or taskbar. */
export function revealWindow(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.focus()
}

/** Forwards mail events to the renderer and shows a native notification for new mail. */
export function createMailEmit(getWindow: () => BrowserWindow | null): Emit {
  return (event) => {
    getWindow()?.webContents.send(IpcChannels.mail.events, event)
    if (event.type === 'mail:new') {
      try {
        // Do Not Disturb: still delivered to the bell above, no OS popup.
        if (getSetting('notifications.dnd') === true) return
        if (!Notification.isSupported()) return
        const notification = new Notification({
          title: event.title ? `New mail from ${event.title}` : 'New mail',
          body: event.body ?? ''
        })
        const target = event.messageId
          ? { accountId: event.accountId, messageId: event.messageId, threadId: event.threadId }
          : null
        notification.on('click', () => {
          live.delete(notification)
          const win = getWindow()
          revealWindow(win)
          // Open the message itself, not just the window.
          if (target) win?.webContents.send(IpcChannels.appOpenMessage, target)
        })
        // Not released on 'close': Windows fires that when the toast times out
        // into the Action Center, where it can still be clicked.
        live.add(notification)
        if (live.size > MAX_LIVE) live.delete(live.values().next().value as Notification)
        notification.show()
      } catch {
        // notifications may be unavailable
      }
    }
  }
}
