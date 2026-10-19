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
  themeCustomAccent: 'theme.customAccent',
  blockRemoteImages: 'privacy.blockRemoteImages',
  trustedSenders: 'privacy.trustedSenders',
  threadedView: 'mail.threaded',
  calendarReminderMinutes: 'calendar.reminderMinutes',
  dictationEnabled: 'compose.dictation',
  /** 'chime' (Clover's own), 'system' (the Windows notification sound) or 'off'. */
  notificationSound: 'notifications.sound',
  /** Account ids whose new mail shows no desktop alert (still in the bell). */
  notificationMutedAccounts: 'notifications.mutedAccounts'
} as const

export type NotificationSound = 'chime' | 'system' | 'off'
