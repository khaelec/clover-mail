import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useApps } from '../state/apps'
import { useCompact } from '../lib/compact'
import { IconArrowLeft, IconGrid, IconPlus, IconRefresh, IconTrash } from './icons'

function AppIcon({ iconDataUrl, name }: { iconDataUrl: string | null; name: string }): ReactNode {
  if (iconDataUrl) {
    return <img src={iconDataUrl} alt={name} className="h-5 w-5 rounded" />
  }
  return (
    <span className="grid h-5 w-5 place-items-center rounded bg-accent/15 text-[10px] font-semibold text-accent">
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function ToggleRow({
  label,
  value,
  onChange
}: {
  label: string
  value: boolean
  onChange: (value: boolean) => void
}): ReactNode {
  return (
    <button
      type="button"
      aria-pressed={value}
      onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between gap-2 py-1 text-left text-[12px] text-muted hover:text-ink"
    >
      <span>{label}</span>
      <span
        className={
          'relative h-4 w-7 shrink-0 rounded-full transition-colors ' + (value ? 'bg-accent' : 'bg-line')
        }
      >
        <span
          className={
            'absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ' +
            (value ? 'left-3.5' : 'left-0.5')
          }
        />
      </span>
    </button>
  )
}

export function AppsView(): ReactNode {
  const apps = useApps((s) => s.apps)
  const activeAppId = useApps((s) => s.activeAppId)
  const creating = useApps((s) => s.creating)
  const load = useApps((s) => s.load)
  const add = useApps((s) => s.add)
  const remove = useApps((s) => s.remove)
  const update = useApps((s) => s.update)
  const select = useApps((s) => s.select)
  const setHost = useApps((s) => s.setHost)
  const compact = useCompact()
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const slotRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void load()
  }, [load])

  const activeApp = apps.find((a) => a.id === activeAppId) ?? null

  useEffect(() => {
    const el = slotRef.current
    if (!el) return
    const update = (): void => {
      const rect = el.getBoundingClientRect()
      setHost({
        appId: activeApp?.id ?? null,
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
      })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      setHost(null)
    }
  }, [activeApp?.id, setHost])

  async function submit(): Promise<void> {
    if (!url.trim()) return
    setError(null)
    try {
      await add({ url: url.trim() })
      setUrl('')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="flex h-full min-h-0">
      <aside
        className={
          compact
            ? activeApp
              ? 'hidden'
              : 'flex w-full flex-col'
            : 'flex w-60 shrink-0 flex-col border-r border-line'
        }
      >
        <div className="border-b border-line px-3.5 py-3">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-ink">
            <IconGrid className="h-4 w-4 text-accent" />
            Custom Apps
          </div>
          <p className="mt-0.5 text-[11px] text-muted">Add your PWA or any web app.</p>
          <p className="mt-2 rounded-lg bg-canvas/50 px-2.5 py-2 text-[11px] leading-relaxed text-muted">
            Apps with <span className="font-medium text-ink/80">Run in background</span> load at
            startup so they can notify you of new messages (e.g. Messenger, WhatsApp) even before
            you open them. Each one uses extra memory (roughly 150–300&nbsp;MB); turn it off to load
            an app only when you open it. Sign-ins are stored per app and stay after restart.
          </p>
        </div>

        <div className="border-b border-line p-2.5">
          <div className="flex items-center gap-1">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void submit()}
              placeholder="https://app.example.com"
              className="flex-1 rounded-lg border border-line bg-canvas/60 px-2.5 py-1.5 text-[12px] text-ink outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => void submit()}
              disabled={creating}
              className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-ink disabled:opacity-50"
            >
              {creating ? <IconRefresh className="h-4 w-4 animate-spin" /> : <IconPlus className="h-4 w-4" />}
            </button>
          </div>
          {error && <div className="mt-1.5 text-[11px] text-rose-500">{error}</div>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
          {apps.length === 0 && <p className="px-1 py-2 text-[12px] text-muted">No apps yet.</p>}
          {apps.map((app) => {
            const active = app.id === activeAppId
            return (
              <div
                key={app.id}
                className={
                  'group flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] transition-colors ' +
                  (active ? 'bg-accent/12 text-accent' : 'text-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/10')
                }
              >
                <button type="button" onClick={() => select(app.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <AppIcon iconDataUrl={app.iconDataUrl} name={app.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{app.name}</span>
                    <span className="block truncate text-[10px] text-muted">{hostOf(app.url)}</span>
                  </span>
                </button>
                <button
                  type="button"
                  title={
                    app.runInBackground
                      ? 'Runs in the background for notifications — click to load only when opened'
                      : 'Loads only when opened — click to run in the background'
                  }
                  aria-label="Run in background"
                  aria-pressed={app.runInBackground}
                  onClick={() => void update(app.id, { runInBackground: !app.runInBackground })}
                  className={
                    'relative h-4 w-7 shrink-0 rounded-full transition-colors ' +
                    (app.runInBackground ? 'bg-accent' : 'bg-line')
                  }
                >
                  <span
                    className={
                      'absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ' +
                      (app.runInBackground ? 'left-3.5' : 'left-0.5')
                    }
                  />
                </button>
                <button
                  type="button"
                  onClick={() => void remove(app.id)}
                  className="opacity-0 transition-opacity group-hover:opacity-100 text-muted hover:text-rose-500"
                >
                  <IconTrash className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </div>

        {activeApp && (
          <div className="border-t border-line p-2.5">
            <div className="mb-1 truncate text-[10px] font-semibold uppercase tracking-wide text-muted">
              {activeApp.name} notifications
            </div>
            <ToggleRow
              label="Show in bell"
              value={activeApp.notifyInBell}
              onChange={(v) => void update(activeApp.id, { notifyInBell: v })}
            />
            <ToggleRow
              label="Also show OS popup"
              value={activeApp.notifyOsPopup}
              onChange={(v) => void update(activeApp.id, { notifyOsPopup: v })}
            />
            <ToggleRow
              label="Hide message previews"
              value={activeApp.notifyHidePreview}
              onChange={(v) => void update(activeApp.id, { notifyHidePreview: v })}
            />
          </div>
        )}
      </aside>

      <section
        className={
          'relative flex min-h-0 min-w-0 flex-1 flex-col bg-canvas ' +
          (compact && !activeApp ? 'hidden' : '')
        }
      >
        {compact && activeApp && (
          <div className="flex shrink-0 items-center gap-2 border-b border-line px-2 py-1.5">
            <button
              type="button"
              aria-label="Back"
              onClick={() => select(null)}
              className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:text-ink"
            >
              <IconArrowLeft className="h-4 w-4" />
            </button>
            <span className="truncate text-[14px] font-medium text-ink">{activeApp.name}</span>
          </div>
        )}
        {activeApp ? (
          <div ref={slotRef} data-clover-appslot className="relative min-h-0 min-w-0 flex-1" />
        ) : (
          <div className="flex h-full items-center justify-center p-8">
            <div className="max-w-sm rounded-3xl border border-line bg-surface/70 p-8 text-center backdrop-blur-xl">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent/12 text-accent ring-1 ring-accent/25">
                <IconGrid className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-[15px] font-semibold text-ink">Embed your own apps</h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                Paste a URL above — including your PWA IT app — and it loads here in an isolated, persistent session.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
