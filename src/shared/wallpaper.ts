export type WallpaperKind =
  | 'none'
  | 'video'
  | 'gif'
  | 'image'
  | 'slideshow'
  | 'html'
  | 'wallpaper-engine'
export type WallpaperFit = 'cover' | 'contain' | 'tile'

export interface WallpaperSettings {
  kind: WallpaperKind
  source: string
  sources: string[]
  sourceUrl: string
  fit: WallpaperFit
  opacity: number
  blur: number
  dim: number
  muted: boolean
  pauseWhenHidden: boolean
  slideshowIntervalMs: number
}

export const DEFAULT_WALLPAPER: WallpaperSettings = {
  kind: 'none',
  source: '',
  sources: [],
  sourceUrl: '',
  fit: 'cover',
  opacity: 0.65,
  blur: 0,
  dim: 0.35,
  muted: true,
  pauseWhenHidden: true,
  slideshowIntervalMs: 15000
}

export const SETTINGS_KEY_WALLPAPER = 'wallpaper.settings'

/** Local files are served through a privileged custom protocol registered in main. */
export function mediaUrl(path: string): string {
  return `clover-media://media/?path=${encodeURIComponent(path)}`
}
