import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useApps } from '../state/apps'
import { IconGrid, IconPlus, IconRefresh, IconTrash } from './icons'

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

export function AppsView(): ReactNode {
  const apps = useApps((s) => s.apps)
  const activeAppId = useApps((s) => s.activeAppId)
  const creating = useApps((s) => s.creating)
  const load = useApps((s) => s.load)
  const add = useApps((s) => s.add)
  const remove = useApps((s) => s.remove)
  const select = useApps((s) => s.select)
  const setDisplayed = useApps((s) => s.setDisplayed)

  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void load()
  }, [load])

  const activeApp = apps.find((a) => a.id === activeAppId) ?? null

  useEffect(() => {
    const host = hostRef.current
    if (!host || !activeApp) return
    host.innerHTML = ''
    const webview = document.createElement('webview')
    webview.setAttribute('src', activeApp.url)
    webview.setAttribute('partition', `persist:app-${activeApp.id}`)
    webview.setAttribute('allowpopups', 'true')
    webview.setAttribute('webpreferences', 'backgroundThrottling=false')
    webview.style.position = 'absolute'
    webview.style.inset = '0'
    webview.style.width = '100%'
    webview.style.height = '100%'
    webview.style.display = 'flex'
    host.appendChild(webview)
    setDisplayed(activeApp.id)
    return () => {
      host.innerHTML = ''
      setDisplayed(null)
    }
  }, [activeApp?.id, activeApp?.url, setDisplayed])

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
      <aside className="flex w-60 shrink-0 flex-col border-r border-line">
        <div className="border-b border-line px-3.5 py-3">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-ink">
            <IconGrid className="h-4 w-4 text-accent" />
            Custom Apps
          </div>
          <p className="mt-0.5 text-[11px] text-muted">Add your PWA or any web app.</p>
          <p className="mt-2 rounded-lg bg-canvas/50 px-2.5 py-2 text-[11px] leading-relaxed text-muted">
            Added apps keep running in the background so they can notify you of new messages (e.g.
            Messenger, WhatsApp). That uses extra memory. Remove an app to stop it. Sign-ins are
            stored per app and stay after restart.
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
                  onClick={() => void remove(app.id)}
                  className="opacity-0 transition-opacity group-hover:opacity-100 text-muted hover:text-rose-500"
                >
                  <IconTrash className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      </aside>

      <section className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-canvas">
        {activeApp ? (
          <div ref={hostRef} className="relative min-h-0 min-w-0 flex-1" />
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
