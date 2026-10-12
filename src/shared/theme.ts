export const THEME_MODES = ['light', 'dark', 'system'] as const
export type ThemeMode = (typeof THEME_MODES)[number]

export const THEME_ACCENTS = ['clover', 'ocean', 'violet', 'sunset', 'rose', 'slate'] as const
export type ThemeAccent = (typeof THEME_ACCENTS)[number]

export interface ThemeSettings {
  mode: ThemeMode
  accent: ThemeAccent
}

export const DEFAULT_THEME: ThemeSettings = {
  mode: 'system',
  accent: 'clover'
}

export const SETTINGS_KEYS = {
  themeMode: 'theme.mode',
  themeAccent: 'theme.accent',
  blockRemoteImages: 'privacy.blockRemoteImages',
  trustedSenders: 'privacy.trustedSenders'
} as const
