import type { ReactNode } from 'react'
import { useSettings } from './context'
import { ACCENT_COLORS, Card, MODE_META, THEME_ACCENTS, THEME_MODES } from './ui'
import { IconCheck } from '../icons'

export function AppearanceTab(): ReactNode {
  const { mode, setMode, accent, setAccent, customAccent, setCustomAccent, importTheme } =
    useSettings()
  return (
    <>
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

      <Card title="Custom theme">
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={customAccent ?? ACCENT_COLORS[accent]}
            onChange={(e) => setCustomAccent(e.target.value)}
            className="h-9 w-12 cursor-pointer rounded-lg border border-line bg-canvas/60"
          />
          <span className="text-[12px] text-muted">
            Pick any accent color, or copy and import a theme between machines.
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCustomAccent(null)}
            className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-muted hover:text-ink"
          >
            Reset to preset
          </button>
          <button
            type="button"
            onClick={() =>
              void window.navigator.clipboard.writeText(
                JSON.stringify({ mode, accent, customAccent })
              )
            }
            className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-muted hover:text-ink"
          >
            Copy theme
          </button>
          <button
            type="button"
            onClick={() => void importTheme()}
            className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-muted hover:text-ink"
          >
            Import theme
          </button>
        </div>
      </Card>
    </>
  )
}
