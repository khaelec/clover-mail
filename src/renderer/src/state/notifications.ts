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
}

interface NotificationsState {
  items: AppNotification[]
  add: (n: Omit<AppNotification, 'id' | 'at' | 'read'>) => void
  markAllRead: () => void
  markRead: (id: string) => void
  markMessageRead: (messageId: string) => void
  markThreadRead: (threadId: string) => void
  clear: () => void
}

let counter = 0

export const useNotifications = create<NotificationsState>((set, get) => ({
  items: [],
  add: (n) => {
    const item: AppNotification = {
      id: `${Date.now()}-${counter++}`,
      at: Date.now(),
      read: false,
      ...n
    }
    set({ items: [item, ...get().items].slice(0, 50) })
  },
  markAllRead: () => set({ items: get().items.map((i) => ({ ...i, read: true })) }),
  markRead: (id) =>
    set({ items: get().items.map((i) => (i.id === id ? { ...i, read: true } : i)) }),
  // Reading a message clears the matching mail notification so the bell stops
  // showing an unread count for mail the user has already seen.
  markMessageRead: (messageId) =>
    set({
      items: get().items.map((i) =>
        i.messageId === messageId ? { ...i, read: true } : i
      )
    }),
  markThreadRead: (threadId) =>
    set({
      items: get().items.map((i) =>
        i.threadId === threadId && !i.read ? { ...i, read: true } : i
      )
    }),
  clear: () => set({ items: [] })
}))
