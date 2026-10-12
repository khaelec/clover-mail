import { create } from 'zustand'

export interface LayoutSettings {
  foldersWidth: number
  listWidth: number
  showFolders: boolean
  dockOpen: boolean
  dockWidth: number
  dockAppId: string | null
}

export const DEFAULT_LAYOUT: LayoutSettings = {
  foldersWidth: 224,
  listWidth: 360,
  showFolders: true,
  dockOpen: false,
  dockWidth: 420,
  dockAppId: null
}

const KEY = 'mail.layout'

interface LayoutState {
  settings: LayoutSettings
  load: () => Promise<void>
  set: (patch: Partial<LayoutSettings>) => void
  save: () => Promise<void>
}

export const useLayout = create<LayoutState>((set, get) => ({
  settings: DEFAULT_LAYOUT,

  load: async () => {
    const all = await window.clover.settings.getAll()
    const stored = all[KEY] as Partial<LayoutSettings> | undefined
    set({ settings: { ...DEFAULT_LAYOUT, ...(stored ?? {}) } })
  },

  set: (patch) => set({ settings: { ...get().settings, ...patch } }),

  save: async () => {
    await window.clover.settings.set(KEY, get().settings)
  }
}))
