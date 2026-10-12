import { create } from 'zustand'
import {
  DEFAULT_WALLPAPER,
  SETTINGS_KEY_WALLPAPER,
  type WallpaperSettings
} from '@shared/wallpaper'

interface WallpaperState {
  settings: WallpaperSettings
  ready: boolean
  load: () => Promise<void>
  patch: (patch: Partial<WallpaperSettings>) => Promise<void>
}

export const useWallpaper = create<WallpaperState>((set, get) => ({
  settings: DEFAULT_WALLPAPER,
  ready: false,

  load: async () => {
    const all = await window.clover.settings.getAll()
    const stored = all[SETTINGS_KEY_WALLPAPER] as Partial<WallpaperSettings> | undefined
    set({ settings: { ...DEFAULT_WALLPAPER, ...(stored ?? {}) }, ready: true })
  },

  patch: async (patch) => {
    const next = { ...get().settings, ...patch }
    set({ settings: next })
    await window.clover.settings.set(SETTINGS_KEY_WALLPAPER, next)
  }
}))
