import { create } from 'zustand'

export interface AppNotification {
  id: string
  kind: 'mail' | 'app' | 'update'
  title: string
  body: string
  at: number
  read: boolean
}

interface NotificationsState {
  items: AppNotification[]
  add: (n: Omit<AppNotification, 'id' | 'at' | 'read'>) => void
  markAllRead: () => void
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
  clear: () => set({ items: [] })
}))
