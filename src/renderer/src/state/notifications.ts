import { create } from 'zustand'

export interface AppNotification {
  id: string
  kind: 'mail' | 'app' | 'update'
  title: string
  body: string
  at: number
  read: boolean
  accountId?: string
  messageId?: string
  threadId?: string
  appId?: string
  appName?: string
  appNotifId?: string
  count?: number
}

interface NotificationsState {
  items: AppNotification[]
  add: (n: Omit<AppNotification, 'id' | 'at' | 'read'>) => void
  markAllRead: () => void
  markRead: (id: string) => void
  markMessageRead: (messageId: string) => void
  markThreadRead: (threadId: string) => void
  markAppRead: (appId: string) => void
  clear: () => void
}

let counter = 0

export const useNotifications = create<NotificationsState>((set, get) => ({
  items: [],
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
        set({ items: next })
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
    set({ items: [item, ...items].slice(0, 50) })
  },
  markAllRead: () => set({ items: get().items.map((i) => ({ ...i, read: true })) }),
  markRead: (id) =>
    set({ items: get().items.map((i) => (i.id === id ? { ...i, read: true } : i)) }),
  // Reading a message clears the matching mail notification so the bell stops
  // showing an unread count for mail the user has already seen.
  markMessageRead: (messageId) =>
    set({ items: get().items.map((i) => (i.messageId === messageId ? { ...i, read: true } : i)) }),
  markThreadRead: (threadId) =>
    set({
      items: get().items.map((i) =>
        i.threadId === threadId && !i.read ? { ...i, read: true } : i
      )
    }),
  // Opening an app clears its notifications.
  markAppRead: (appId) =>
    set({ items: get().items.map((i) => (i.appId === appId ? { ...i, read: true } : i)) }),
  clear: () => set({ items: [] })
}))
