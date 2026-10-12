import { create } from 'zustand'
import type { CreateAppInput, CustomApp } from '@shared/apps'

interface AppsState {
  apps: CustomApp[]
  activeAppId: string | null
  displayedAppId: string | null
  loading: boolean
  creating: boolean
  load: () => Promise<void>
  add: (input: CreateAppInput) => Promise<CustomApp>
  remove: (id: string) => Promise<void>
  select: (id: string | null) => void
  setDisplayed: (id: string | null) => void
}

export const useApps = create<AppsState>((set, get) => ({
  apps: [],
  activeAppId: null,
  displayedAppId: null,
  loading: false,
  creating: false,

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
  },

  select: (id) => set({ activeAppId: id }),
  setDisplayed: (id) => set({ displayedAppId: id })
}))
