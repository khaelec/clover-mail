import type { ReactNode } from 'react'
import { THEME_ACCENTS, THEME_MODES, type ThemeAccent, type ThemeMode } from '@shared/theme'
import { IconMonitor, IconMoon, IconSun } from '../icons'

export type TabId = 'appearance' | 'privacy' | 'mail' | 'accounts' | 'ai' | 'about'

export const TABS: { id: TabId; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'mail', label: 'Mail' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'ai', label: 'AI & MCP' },
  { id: 'about', label: 'Updates & About' }
]

export const MODE_META: Record<ThemeMode, { label: string; icon: (p: { className?: string }) => ReactNode }> = {
  light: { label: 'Light', icon: IconSun },
  dark: { label: 'Dark', icon: IconMoon },
  system: { label: 'System', icon: IconMonitor }
}

export const ACCENT_COLORS: Record<ThemeAccent, string> = {
  clover: '#10b981',
  ocean: '#3b82f6',
  violet: '#8b5cf6',
  sunset: '#f59e0b',
  rose: '#f43f5e',
  slate: '#64748b'
}

// Re-exported so tabs don't each import from @shared/theme.
export { THEME_ACCENTS, THEME_MODES }

export function Card({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <section className="rounded-2xl border border-line bg-surface/70 p-5 backdrop-blur-xl">
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  hint
}: {
  label: string
  value: string | number
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  hint?: string
}): ReactNode {
  return (
    <label className="block w-full">
      <span className="mb-1 flex items-center gap-1 text-[11px] font-medium text-muted">
        {label}
        {hint && (
          <span title={hint} className="cursor-help text-muted/70">
            ⓘ
          </span>
        )}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        title={hint}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-line bg-canvas/60 px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-accent"
      />
    </label>
  )
}
