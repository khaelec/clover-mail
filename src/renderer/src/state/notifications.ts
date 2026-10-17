import { create } from 'zustand'
import type { NotificationInput, StoredNotification } from '@shared/notifications'

export type AppNotification = StoredNotification

interface NotificationsState {
  items: AppNotification[]
  load: () => Promise<void>
  add: (n: NotificationInput) => void
  markAllRead: () => void
  markRead: (id: string) => void
  markMessageRead: (messageId: string) => void
  markThreadRead: (threadId: string) => void
  markAppRead: (appId: string) => void
  /** Drop notifications for mail deleted on the server, and clear ones now read. */
  reconcileMail: () => Promise<void>
  remove: (id: string) => void
  clear: () => void
}

let counter = 0
let subscribed = false
// One status lookup at a time; a request made meanwhile runs once afterwards.
let reconciling = false
let reconcileAgain = false

/** The messages a mail alert is about. */
function messagesOf(item: AppNotification): string[] {
  if (item.messageIds?.length) return item.messageIds
  return item.messageId ? [item.messageId] : []
}
function covers(item: AppNotification, messageId: string): boolean {
  return messagesOf(item).includes(messageId)
}
// Only a window that loaded the bell may save it; a pop-out message window has
// an empty list and would otherwise wipe the stored notifications.
let loaded = false

export const useNotifications = create<NotificationsState>((set, get) => {
  // Persist to the database (main) so the bell survives restarts. Skipped outside
  // the renderer (e.g. the store imported by a Node smoke test).
  function persist(): void {
    if (typeof window === 'undefined' || !window.clover || !loaded) return
    void window.clover.notifications.save(get().items).catch(() => undefined)
  }
  function commit(items: AppNotification[]): void {
    set({ items })
    persist()
  }

  return {
    items: [],

    load: async () => {
      if (typeof window === 'undefined' || !window.clover) return
      try {
        const stored = await window.clover.notifications.list()
        set({ items: stored })
        loaded = true
      } catch {
        // first run / offline
      }
      // Main-process sources (calendar reminders, send failures, snooze returns)
      // push items here so they reach the same bell.
      if (!subscribed) {
        subscribed = true
        window.clover.notifications.onNotify((n) => get().add(n))
      }
    },

    add: (n) => {
      const items = get().items
      // One bell item per mail message: overlapping syncs (or IDLE racing the
      // periodic sync) can emit mail:new for the same message more than once.
      if (n.messageId && items.some((i) => covers(i, n.messageId as string))) return

      // Collapse repeated system alerts (the same sync error every few minutes).
      if (n.kind === 'system') {
        const idx = items.findIndex((i) => i.kind === 'system' && i.title === n.title && !i.read)
        if (idx >= 0) {
          const next = items.slice()
          next[idx] = { ...next[idx], body: n.body ?? '', at: Date.now() }
          commit(next)
          return
        }
      }

      // Group a burst from one app into a single item ("WhatsApp · 5 new").
      if (n.kind === 'app' && n.appId) {
        const idx = items.findIndex((i) => i.kind === 'app' && i.appId === n.appId && !i.read)
        if (idx >= 0) {
          const existing = items[idx]
          const next = items.slice()
          next[idx] = {
            ...existing,
            title: n.title,
            body: n.body ?? '',
            at: Date.now(),
            count: (existing.count ?? 1) + 1,
            appNotifId: n.appNotifId ?? existing.appNotifId
          }
          commit(next)
          return
        }
      }

      const item: AppNotification = {
        ...n,
        body: n.body ?? '',
        id: `${Date.now()}-${counter++}`,
        at: Date.now(),
        read: false,
        count: n.count ?? 1
      }
      commit([item, ...items].slice(0, 50))
    },

    markAllRead: () => commit(get().items.map((i) => ({ ...i, read: true }))),
    markRead: (id) =>
      commit(get().items.map((i) => (i.id === id ? { ...i, read: true } : i))),
    // Reading a message clears the matching mail notification so the bell stops
    // showing an unread count for mail the user has already seen.
    markMessageRead: (messageId) => {
      const items = get().items
      if (!items.some((i) => !i.read && covers(i, messageId))) return
      commit(items.map((i) => (covers(i, messageId) ? { ...i, read: true } : i)))
    },
    markThreadRead: (threadId) => {
      const items = get().items
      if (!items.some((i) => i.threadId === threadId && !i.read)) return
      commit(items.map((i) => (i.threadId === threadId && !i.read ? { ...i, read: true } : i)))
    },
    markAppRead: (appId) =>
      commit(get().items.map((i) => (i.appId === appId ? { ...i, read: true } : i))),

    reconcileMail: async () => {
      if (reconciling) {
        reconcileAgain = true
        return
      }
      const ids = [
        ...new Set(get().items.filter((i) => i.kind === 'mail').flatMap(messagesOf))
      ]
      if (ids.length === 0) return
      reconciling = true
      let status: Record<string, { exists: boolean; isRead: boolean }>
      try {
        status = await window.clover.mail.notificationStatus(ids)
      } catch {
        return
      } finally {
        reconciling = false
      }
      let changed = false
      const next: AppNotification[] = []
      for (const item of get().items) {
        const covered = item.kind === 'mail' ? messagesOf(item) : []
        const known = covered.map((id) => status[id]).filter(Boolean)
        // Only judge items whose messages were all looked up (not ones added
        // while the lookup ran).
        if (covered.length === 0 || known.length < covered.length) {
          next.push(item)
          continue
        }
        if (known.every((s) => !s.exists)) {
          changed = true // deleted (on the server or here) -> drop it
          continue
        }
        if (!item.read && known.every((s) => !s.exists || s.isRead)) {
          changed = true // all of it has been read, here or on another device
          next.push({ ...item, read: true })
          continue
        }
        next.push(item)
      }
      if (changed) commit(next)
      if (reconcileAgain) {
        reconcileAgain = false
        void get().reconcileMail()
      }
    },

    remove: (id) => commit(get().items.filter((i) => i.id !== id)),

    clear: () => commit([])
  }
})
