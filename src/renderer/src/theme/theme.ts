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
  customAccent: string | null
  effective: EffectiveMode
  ready: boolean
  setMode: (mode: ThemeMode) => void
  setAccent: (accent: ThemeAccent) => void
  setCustomAccent: (hex: string | null) => void
}

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')

function resolve(mode: ThemeMode): EffectiveMode {
  if (mode === 'system') return darkQuery.matches ? 'dark' : 'light'
  return mode
}

function hexInk(hex: string): string {
  const c = hex.replace('#', '')
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? '#0b1220' : '#ffffff'
}

function paint(mode: ThemeMode, accent: ThemeAccent, customAccent: string | null): EffectiveMode {
  const effective = resolve(mode)
  const root = document.documentElement
  root.dataset.theme = effective
  root.dataset.accent = accent
  if (customAccent && /^#[0-9a-fA-F]{6}$/.test(customAccent)) {
    root.style.setProperty('--accent', customAccent)
    root.style.setProperty('--accent-ink', hexInk(customAccent))
  } else {
    root.style.removeProperty('--accent')
    root.style.removeProperty('--accent-ink')
  }
  return effective
}

export const useTheme = create<ThemeState>((set, get) => ({
  mode: DEFAULT_THEME.mode,
  accent: DEFAULT_THEME.accent,
  customAccent: null,
  effective: resolve(DEFAULT_THEME.mode),
  ready: false,
  setMode: (mode) => {
    const effective = paint(mode, get().accent, get().customAccent)
    set({ mode, effective })
    void window.clover.settings.set(SETTINGS_KEYS.themeMode, mode)
  },
  setAccent: (accent) => {
    paint(get().mode, accent, get().customAccent)
    set({ accent })
    void window.clover.settings.set(SETTINGS_KEYS.themeAccent, accent)
  },
  setCustomAccent: (hex) => {
    paint(get().mode, get().accent, hex)
    set({ customAccent: hex })
    void window.clover.settings.set(SETTINGS_KEYS.themeCustomAccent, hex ?? '')
  }
}))

darkQuery.addEventListener('change', () => {
  const { mode, accent, customAccent } = useTheme.getState()
  if (mode === 'system') {
    useTheme.setState({ effective: paint(mode, accent, customAccent) })
  }
})

export async function initTheme(): Promise<void> {
  const settings = await window.clover.settings.getAll()
  const mode = (settings[SETTINGS_KEYS.themeMode] as ThemeMode) ?? DEFAULT_THEME.mode
  const accent =
    (settings[SETTINGS_KEYS.themeAccent] as ThemeAccent) ?? DEFAULT_THEME.accent
  const customAccent = (settings[SETTINGS_KEYS.themeCustomAccent] as string) || null
  useTheme.setState({
    mode,
    accent,
    customAccent,
    effective: paint(mode, accent, customAccent),
    ready: true
  })
}
