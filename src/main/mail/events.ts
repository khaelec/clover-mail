import { Notification, type BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/channels'
import { getSetting } from '@core/settings'
import type { MailEvent } from '@shared/mail'
import { SETTINGS_KEYS, type NotificationSound } from '@shared/theme'

export type Emit = (event: MailEvent) => void

// Electron drops a Notification's click handler once the JS object is garbage
// collected, so a toast clicked a few minutes later (or from the Windows Action
// Center) did nothing. Keep recent ones referenced.
const live = new Set<Notification>()
const MAX_LIVE = 30

// Overlapping syncs (IDLE racing the periodic sync, a folder refresh racing
// both) can emit mail:new for the same message twice. The bell store already
// de-duplicates items, but the native toast and chime fired once per event, so
// the user heard the same mail again. Remember what was announced recently and
// stay silent for a repeat.
const ANNOUNCED_TTL_MS = 10 * 60_000
const MAX_ANNOUNCED = 500
const announced = new Map<string, number>()

function wasAnnounced(ids: string[], now: number): boolean {
  if (ids.length === 0) return false
  return ids.every((id) => now - (announced.get(id) ?? 0) < ANNOUNCED_TTL_MS)
}

function rememberAnnounced(ids: string[], now: number): void {
  for (const id of ids) {
    // Re-insert so the cap drops the oldest entry, not this one.
    announced.delete(id)
    announced.set(id, now)
  }
  while (announced.size > MAX_ANNOUNCED) {
    const oldest = announced.keys().next().value
    if (oldest === undefined) break
    announced.delete(oldest)
  }
}

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
    if (event.type !== 'mail:new') {
      getWindow()?.webContents.send(IpcChannels.mail.events, event)
      return
    }
    // Do Not Disturb, or an account set to "no alerts": the bell still gets it,
    // but no popup and no sound.
    const muted = getSetting(SETTINGS_KEYS.notificationMutedAccounts)
    const quiet =
      getSetting('notifications.dnd') === true ||
      (Array.isArray(muted) && muted.includes(event.accountId))
    const sound = (getSetting(SETTINGS_KEYS.notificationSound) as NotificationSound | undefined) ?? 'chime'
    const ids = event.messageIds?.length
      ? event.messageIds
      : event.messageId
        ? [event.messageId]
        : []
    const now = Date.now()
    const duplicate = wasAnnounced(ids, now)
    rememberAnnounced(ids, now)
    getWindow()?.webContents.send(IpcChannels.mail.events, {
      ...event,
      chime: !quiet && !duplicate && sound === 'chime'
    })
    if (quiet || duplicate) return
    {
      try {
        if (!Notification.isSupported()) return
        const notification = new Notification({
          title: event.title ? `New mail from ${event.title}` : 'New mail',
          body: event.body ?? '',
          // Windows plays its own sound unless silent; the chime is played by
          // the app window instead.
          silent: sound !== 'system'
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
