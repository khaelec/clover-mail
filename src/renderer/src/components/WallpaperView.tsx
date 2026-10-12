import { useEffect, useState, type ReactNode } from 'react'
import type { WallpaperFit, WallpaperKind, WeDetection } from '@shared/wallpaper'
import { mediaUrl } from '@shared/wallpaper'
import { useWallpaper } from '../state/wallpaper'
import { IconRefresh, IconWallpaper } from './icons'

const KINDS: { value: WallpaperKind; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'video', label: 'Video' },
  { value: 'gif', label: 'GIF' },
  { value: 'image', label: 'Image' },
  { value: 'slideshow', label: 'Slideshow' },
  { value: 'html', label: 'HTML / Web' },
  { value: 'wallpaper-engine', label: 'Wallpaper Engine' }
]

const FITS: WallpaperFit[] = ['cover', 'contain', 'tile']

function Row({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-32 shrink-0 text-[12px] text-muted">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
    </div>
  )
}

function Slider({
  value,
  min,
  max,
  step,
  onChange
}: {
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}): ReactNode {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-[var(--accent)]"
    />
  )
}

export function WallpaperView(): ReactNode {
  const settings = useWallpaper((s) => s.settings)
  const patch = useWallpaper((s) => s.patch)
  const [urlDraft, setUrlDraft] = useState(settings.sourceUrl)
  const [we, setWe] = useState<WeDetection | null>(null)
  const [weLoading, setWeLoading] = useState(false)

  const needsFile = ['video', 'gif', 'image'].includes(settings.kind)
  const isHtml = settings.kind === 'html' || settings.kind === 'wallpaper-engine'

  async function detectWe(): Promise<void> {
    setWeLoading(true)
    try {
      setWe(await window.clover.wallpaper.detectEngine())
    } finally {
      setWeLoading(false)
    }
  }

  useEffect(() => {
    if (settings.kind === 'wallpaper-engine' && we === null && !weLoading) void detectWe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.kind])

  async function chooseFile(): Promise<void> {
    const path = await window.clover.wallpaper.pickFile(settings.kind)
    if (path) void patch({ source: path })
  }

  async function chooseFolder(): Promise<void> {
    const folder = await window.clover.wallpaper.pickFolder()
    if (!folder) return
    const sources = await window.clover.wallpaper.listFolder(folder)
    void patch({ sources })
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-8 py-8">
        <div className="flex items-center gap-2">
          <IconWallpaper className="h-5 w-5 text-accent" />
          <h1 className="text-xl font-semibold tracking-tight text-ink">Live wallpaper</h1>
        </div>
        <p className="mt-1 text-[13px] text-muted">
          Set a moving background behind your mail. Changes apply instantly.
        </p>

        <section className="mt-6 rounded-2xl border border-line bg-surface/70 p-5 backdrop-blur-xl">
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => void patch({ kind: k.value })}
                className={
                  'rounded-lg border px-3 py-1.5 text-[12px] transition-colors ' +
                  (settings.kind === k.value
                    ? 'border-accent bg-accent/12 text-accent'
                    : 'border-line text-muted hover:text-ink')
                }
              >
                {k.label}
              </button>
            ))}
          </div>

          <div className="mt-5 space-y-1">
            {needsFile && (
              <Row label="Source">
                <button
                  type="button"
                  onClick={() => void chooseFile()}
                  className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-accent-ink"
                >
                  Choose file
                </button>
                <span className="truncate text-[12px] text-muted">{settings.source || 'No file selected'}</span>
              </Row>
            )}

            {isHtml && (
              <>
                <Row label="Or web URL">
                  <input
                    value={urlDraft}
                    onChange={(e) => setUrlDraft(e.target.value)}
                    placeholder="https://…"
                    className="flex-1 rounded-lg border border-line bg-canvas/60 px-2.5 py-1.5 text-[12px] text-ink outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={() => void patch({ sourceUrl: urlDraft.trim() })}
                    className="rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-muted hover:text-ink"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={() => void chooseFile()}
                    className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-accent-ink"
                  >
                    Choose file
                  </button>
                </Row>
                {settings.kind === 'wallpaper-engine' && (
                  <div className="mt-2 rounded-xl border border-line bg-canvas/40 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-[12px] font-medium text-ink">Wallpaper Engine library</span>
                      {we?.installed && (
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-500">
                          detected
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => void detectWe()}
                        className="ml-auto flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] text-muted hover:text-accent"
                      >
                        <IconRefresh className={weLoading ? 'h-3 w-3 animate-spin' : 'h-3 w-3'} />
                        Rescan
                      </button>
                    </div>

                    {weLoading && <p className="text-[11px] text-muted">Scanning Steam…</p>}
                    {!weLoading && we && !we.installed && (
                      <p className="text-[11px] text-muted">
                        Wallpaper Engine not found (Steam install not detected). Use the manual file/URL above.
                      </p>
                    )}
                    {!weLoading && we && we.installed && we.wallpapers.length === 0 && (
                      <p className="text-[11px] text-muted">Found Wallpaper Engine, but no video/web wallpapers to load.</p>
                    )}
                    {!weLoading && we && we.wallpapers.length > 0 && (
                      <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                        {we.wallpapers.map((w) => {
                          const selected = settings.source === w.path && w.path !== ''
                          return (
                            <button
                              key={`${w.source}-${w.id}`}
                              type="button"
                              disabled={!w.supported}
                              title={w.supported ? w.title : `${w.title} (${w.type} — not supported)`}
                              onClick={() => w.kind && void patch({ kind: w.kind, source: w.path, sourceUrl: '' })}
                              className={
                                'overflow-hidden rounded-lg border text-left transition-colors ' +
                                (selected
                                  ? 'border-accent'
                                  : w.supported
                                    ? 'border-line hover:border-accent/60'
                                    : 'border-line opacity-50')
                              }
                            >
                              <div className="aspect-video w-full bg-black/20">
                                {w.preview ? (
                                  <img src={mediaUrl(w.preview)} className="h-full w-full object-cover" />
                                ) : (
                                  <div className="grid h-full w-full place-items-center text-[10px] text-muted">
                                    {w.type}
                                  </div>
                                )}
                              </div>
                              <div className="p-1.5">
                                <div className="truncate text-[11px] text-ink">{w.title}</div>
                                <div className="text-[10px] text-muted">
                                  {w.supported ? w.kind : `${w.type} · unsupported`}
                                </div>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}
                    <p className="mt-2 text-[10px] leading-relaxed text-muted">
                      Video and web wallpapers load directly. Scene (.pkg) and application wallpapers are proprietary
                      and can't be embedded.
                    </p>
                  </div>
                )}
              </>
            )}

            {settings.kind === 'slideshow' && (
              <Row label="Folder">
                <button
                  type="button"
                  onClick={() => void chooseFolder()}
                  className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-accent-ink"
                >
                  Choose folder
                </button>
                <span className="text-[12px] text-muted">{settings.sources.length} image(s)</span>
              </Row>
            )}

            {settings.kind !== 'none' && (
              <>
                <Row label="Fit">
                  <select
                    value={settings.fit}
                    onChange={(e) => void patch({ fit: e.target.value as WallpaperFit })}
                    className="rounded-lg border border-line bg-canvas/60 px-2 py-1.5 text-[12px] text-ink outline-none"
                  >
                    {FITS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </Row>
                <Row label={`Opacity ${Math.round(settings.opacity * 100)}%`}>
                  <Slider value={settings.opacity} min={0.1} max={1} step={0.05} onChange={(v) => void patch({ opacity: v })} />
                </Row>
                <Row label={`Blur ${settings.blur}px`}>
                  <Slider value={settings.blur} min={0} max={40} step={1} onChange={(v) => void patch({ blur: v })} />
                </Row>
                <Row label={`Dim ${Math.round(settings.dim * 100)}%`}>
                  <Slider value={settings.dim} min={0} max={0.9} step={0.05} onChange={(v) => void patch({ dim: v })} />
                </Row>
                {settings.kind === 'slideshow' && (
                  <Row label={`Interval ${Math.round(settings.slideshowIntervalMs / 1000)}s`}>
                    <Slider
                      value={settings.slideshowIntervalMs}
                      min={3000}
                      max={120000}
                      step={1000}
                      onChange={(v) => void patch({ slideshowIntervalMs: v })}
                    />
                  </Row>
                )}
                <Row label="Options">
                  <label className="flex items-center gap-1.5 text-[12px] text-muted">
                    <input
                      type="checkbox"
                      checked={settings.muted}
                      onChange={(e) => void patch({ muted: e.target.checked })}
                    />
                    Mute video
                  </label>
                  <label className="ml-4 flex items-center gap-1.5 text-[12px] text-muted">
                    <input
                      type="checkbox"
                      checked={settings.pauseWhenHidden}
                      onChange={(e) => void patch({ pauseWhenHidden: e.target.checked })}
                    />
                    Pause when hidden
                  </label>
                </Row>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
