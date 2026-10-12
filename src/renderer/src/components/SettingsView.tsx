import { useEffect, useState, type ReactNode } from 'react'
import {
  SETTINGS_KEYS,
  THEME_ACCENTS,
  THEME_MODES,
  type ThemeAccent,
  type ThemeMode
} from '@shared/theme'
import type { AppInfo } from '@shared/ipc'
import { useTheme } from '../theme/theme'
import { IconCheck, IconMonitor, IconMoon, IconSun } from './icons'

const MODE_META: Record<ThemeMode, { label: string; icon: (p: { className?: string }) => ReactNode }> = {
  light: { label: 'Light', icon: IconSun },
  dark: { label: 'Dark', icon: IconMoon },
  system: { label: 'System', icon: IconMonitor }
}

const ACCENT_COLORS: Record<ThemeAccent, string> = {
  clover: '#10b981',
  ocean: '#3b82f6',
  violet: '#8b5cf6',
  sunset: '#f59e0b',
  rose: '#f43f5e',
  slate: '#64748b'
}

function Card({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <section className="rounded-2xl border border-line bg-surface/70 p-5 backdrop-blur-xl">
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function SettingsView(): ReactNode {
  const { mode, accent, setMode, setAccent } = useTheme()
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [blockRemote, setBlockRemote] = useState(true)

  useEffect(() => {
    void window.clover.appInfo().then(setInfo)
    void window.clover.settings.getAll().then((settings) => {
      setBlockRemote(settings[SETTINGS_KEYS.blockRemoteImages] !== false)
    })
  }, [])

  function toggleBlockRemote(): void {
    const next = !blockRemote
    setBlockRemote(next)
    void window.clover.settings.set(SETTINGS_KEYS.blockRemoteImages, next)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-8 py-8">
        <h1 className="text-xl font-semibold tracking-tight text-ink">Settings</h1>
        <p className="mt-1 text-[13px] text-muted">Appearance and application information.</p>

        <div className="mt-6 space-y-4">
          <Card title="Theme">
            <div className="grid grid-cols-3 gap-2">
              {THEME_MODES.map((m) => {
                const meta = MODE_META[m]
                const Icon = meta.icon
                const active = mode === m
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={
                      'flex flex-col items-center gap-2 rounded-xl border p-3 text-[12px] transition-all ' +
                      (active
                        ? 'border-accent bg-accent/8 text-accent'
                        : 'border-line text-muted hover:border-accent/40 hover:text-ink')
                    }
                  >
                    <Icon className="h-5 w-5" />
                    {meta.label}
                  </button>
                )
              })}
            </div>
          </Card>

          <Card title="Accent">
            <div className="flex flex-wrap gap-3">
              {THEME_ACCENTS.map((a) => {
                const active = accent === a
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAccent(a)}
                    title={a}
                    aria-label={a}
                    className={
                      'grid h-9 w-9 place-items-center rounded-full ring-2 ring-offset-2 ring-offset-surface transition-transform hover:scale-105 ' +
                      (active ? 'ring-ink' : 'ring-transparent')
                    }
                    style={{ backgroundColor: ACCENT_COLORS[a] }}
                  >
                    {active && <IconCheck className="h-4 w-4 text-white" />}
                  </button>
                )
              })}
            </div>
          </Card>

          <Card title="Privacy">
            <button
              type="button"
              onClick={toggleBlockRemote}
              className="flex w-full items-center justify-between gap-4 text-left"
            >
              <span>
                <span className="block text-[13px] text-ink">Block remote images</span>
                <span className="mt-0.5 block text-[12px] text-muted">
                  Prevents senders from tracking when you open a message. Inline images still show.
                </span>
              </span>
              <span
                className={
                  'relative h-6 w-11 shrink-0 rounded-full transition-colors ' +
                  (blockRemote ? 'bg-accent' : 'bg-line')
                }
              >
                <span
                  className={
                    'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ' +
                    (blockRemote ? 'left-[22px]' : 'left-0.5')
                  }
                />
              </span>
            </button>
          </Card>

          <Card title="About">
            <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-[13px]">
              <dt className="text-muted">Application</dt>
              <dd className="text-ink">{info?.name ?? 'Clover Mail'}</dd>
              <dt className="text-muted">Version</dt>
              <dd className="text-ink">{info?.version ?? '—'}</dd>
              <dt className="text-muted">Electron</dt>
              <dd className="text-ink">{info?.electron ?? '—'}</dd>
              <dt className="text-muted">Chromium</dt>
              <dd className="text-ink">{info?.chrome ?? '—'}</dd>
              <dt className="text-muted">Node</dt>
              <dd className="text-ink">{info?.node ?? '—'}</dd>
              <dt className="text-muted">Data folder</dt>
              <dd className="break-all text-ink">{info?.userDataPath ?? '—'}</dd>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  )
}
