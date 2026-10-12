import { create } from 'zustand'
import {
  DEFAULT_THEME,
  SETTINGS_KEYS,
  type ThemeAccent,
  type ThemeMode
} from '@shared/theme'

export type EffectiveMode = 'light' | 'dark'

interface ThemeState {
  mode: ThemeMode
  accent: ThemeAccent
  effective: EffectiveMode
  ready: boolean
  setMode: (mode: ThemeMode) => void
  setAccent: (accent: ThemeAccent) => void
}

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')

function resolve(mode: ThemeMode): EffectiveMode {
  if (mode === 'system') return darkQuery.matches ? 'dark' : 'light'
  return mode
}

function paint(mode: ThemeMode, accent: ThemeAccent): EffectiveMode {
  const effective = resolve(mode)
  const root = document.documentElement
  root.dataset.theme = effective
  root.dataset.accent = accent
  return effective
}

export const useTheme = create<ThemeState>((set, get) => ({
  mode: DEFAULT_THEME.mode,
  accent: DEFAULT_THEME.accent,
  effective: resolve(DEFAULT_THEME.mode),
  ready: false,
  setMode: (mode) => {
    const effective = paint(mode, get().accent)
    set({ mode, effective })
    void window.clover.settings.set(SETTINGS_KEYS.themeMode, mode)
  },
  setAccent: (accent) => {
    paint(get().mode, accent)
    set({ accent })
    void window.clover.settings.set(SETTINGS_KEYS.themeAccent, accent)
  }
}))

darkQuery.addEventListener('change', () => {
  const { mode, accent } = useTheme.getState()
  if (mode === 'system') {
    useTheme.setState({ effective: paint(mode, accent) })
  }
})

export async function initTheme(): Promise<void> {
  const settings = await window.clover.settings.getAll()
  const mode = (settings[SETTINGS_KEYS.themeMode] as ThemeMode) ?? DEFAULT_THEME.mode
  const accent =
    (settings[SETTINGS_KEYS.themeAccent] as ThemeAccent) ?? DEFAULT_THEME.accent
  useTheme.setState({ mode, accent, effective: paint(mode, accent), ready: true })
}
