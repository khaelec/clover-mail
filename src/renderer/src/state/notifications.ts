import { create } from 'zustand'
import type { StoredNotification } from '@shared/notifications'

export type AppNotification = StoredNotification

interface NotificationsState {
  items: AppNotification[]
  load: () => Promise<void>
  add: (n: Omit<AppNotification, 'id' | 'at' | 'read'>) => void
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

export const useNotifications = create<NotificationsState>((set, get) => {
  // Persist to the database (main) so the bell survives restarts. Skipped outside
  // the renderer (e.g. the store imported by a Node smoke test).
  function persist(): void {
    if (typeof window === 'undefined' || !window.clover) return
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
      } catch {
        // first run / offline
      }
    },

    add: (n) => {
      const items = get().items
      // One bell item per mail message: overlapping syncs (or IDLE racing the
      // periodic sync) can emit mail:new for the same message more than once.
      if (n.messageId && items.some((i) => i.messageId === n.messageId)) return

      // Group a burst from one app into a single item ("WhatsApp · 5 new").
      if (n.kind === 'app' && n.appId) {
        const idx = items.findIndex((i) => i.kind === 'app' && i.appId === n.appId && !i.read)
        if (idx >= 0) {
          const existing = items[idx]
          const next = items.slice()
          next[idx] = {
            ...existing,
            title: n.title,
            body: n.body,
            at: Date.now(),
            count: (existing.count ?? 1) + 1,
            appNotifId: n.appNotifId ?? existing.appNotifId
          }
          commit(next)
          return
        }
      }

      const item: AppNotification = {
        id: `${Date.now()}-${counter++}`,
        at: Date.now(),
        read: false,
        count: 1,
        ...n
      }
      commit([item, ...items].slice(0, 50))
    },

    markAllRead: () => commit(get().items.map((i) => ({ ...i, read: true }))),
    markRead: (id) =>
      commit(get().items.map((i) => (i.id === id ? { ...i, read: true } : i))),
    // Reading a message clears the matching mail notification so the bell stops
    // showing an unread count for mail the user has already seen.
    markMessageRead: (messageId) =>
      commit(get().items.map((i) => (i.messageId === messageId ? { ...i, read: true } : i))),
    markThreadRead: (threadId) =>
      commit(
        get().items.map((i) => (i.threadId === threadId && !i.read ? { ...i, read: true } : i))
      ),
    markAppRead: (appId) =>
      commit(get().items.map((i) => (i.appId === appId ? { ...i, read: true } : i))),

    reconcileMail: async () => {
      const ids = get()
        .items.filter((i) => i.kind === 'mail' && i.messageId)
        .map((i) => i.messageId as string)
      if (ids.length === 0) return
      let status: Record<string, { exists: boolean; isRead: boolean }>
      try {
        status = await window.clover.mail.notificationStatus(ids)
      } catch {
        return
      }
      let changed = false
      const next: AppNotification[] = []
      for (const item of get().items) {
        if (item.kind !== 'mail' || !item.messageId) {
          next.push(item)
          continue
        }
        const s = status[item.messageId]
        if (s && !s.exists) {
          changed = true // deleted on the server -> drop it
          continue
        }
        if (s && s.isRead && !item.read) {
          changed = true
          next.push({ ...item, read: true })
          continue
        }
        next.push(item)
      }
      if (changed) commit(next)
    },

    remove: (id) => commit(get().items.filter((i) => i.id !== id)),

    clear: () => commit([])
  }
})
