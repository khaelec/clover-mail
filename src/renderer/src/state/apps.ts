import { create } from 'zustand'
import type { CreateAppInput, CustomApp } from '@shared/apps'
import { useNotifications } from './notifications'

interface AppHostSlot {
  appId: string | null
  rect: { left: number; top: number; width: number; height: number }
}

interface AppsState {
  apps: CustomApp[]
  activeAppId: string | null
  host: AppHostSlot | null
  loading: boolean
  creating: boolean
  appUnread: Record<string, number>
  appUnreadTotal: number
  appNotifiedAt: Record<string, number>
  load: () => Promise<void>
  add: (input: CreateAppInput) => Promise<CustomApp>
  remove: (id: string) => Promise<void>
  update: (id: string, patch: Partial<CustomApp>) => Promise<void>
  select: (id: string | null) => void
  setHost: (host: AppHostSlot | null) => void
  setAppUnread: (id: string, name: string, count: number) => void
  markAppNotified: (id: string) => void
}

export const useApps = create<AppsState>((set, get) => ({
  apps: [],
  activeAppId: null,
  host: null,
  loading: false,
  creating: false,
  appUnread: {},
  appUnreadTotal: 0,
  appNotifiedAt: {},

  load: async () => {
    set({ loading: true })
    const apps = await window.clover.apps.list()
    const current = get().activeAppId
    set({
      apps,
      loading: false,
      activeAppId: current && apps.some((a) => a.id === current) ? current : (apps[0]?.id ?? null)
    })
  },

  add: async (input) => {
    set({ creating: true })
    try {
      const app = await window.clover.apps.create(input)
      await get().load()
      set({ activeAppId: app.id })
      return app
    } finally {
      set({ creating: false })
    }
  },

  remove: async (id) => {
    await window.clover.apps.remove(id)
    await get().load()
    if (get().activeAppId === id) set({ activeAppId: get().apps[0]?.id ?? null })
    const appUnread = { ...get().appUnread }
    delete appUnread[id]
    set({ appUnread, appUnreadTotal: Object.values(appUnread).reduce((a, b) => a + b, 0) })
  },

  update: async (id, patch) => {
    await window.clover.apps.update(id, patch)
    await get().load()
  },

  select: (id) => set({ activeAppId: id }),
  setHost: (host) => set({ host }),

  setAppUnread: (id, name, count) => {
    const prev = get().appUnread[id] ?? 0
    const next = { ...get().appUnread, [id]: count }
    // If the app posts real notifications (captured via the preload), those are
    // richer than a title count — use the count only for the badge, and only fall
    // back to a title-count bell item when no real notification arrived recently.
    const recentReal = Date.now() - (get().appNotifiedAt[id] ?? 0) < 30_000
    if (count > prev && !recentReal) {
      useNotifications.getState().add({
        kind: 'app',
        appId: id,
        appName: name,
        title: `New message in ${name}`,
        body: count > 1 ? `${count} unread` : ''
      })
    }
    set({ appUnread: next, appUnreadTotal: Object.values(next).reduce((a, b) => a + b, 0) })
  },

  markAppNotified: (id) => set({ appNotifiedAt: { ...get().appNotifiedAt, [id]: Date.now() } })
}))
