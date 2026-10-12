import type { ReactNode } from 'react'
import { useUpdate } from '../state/update'

export function UpdateBanner(): ReactNode {
  const status = useUpdate((s) => s.status)
  const version = useUpdate((s) => s.version)
  const percent = useUpdate((s) => s.percent)
  const dismissed = useUpdate((s) => s.dismissed)
  const download = useUpdate((s) => s.download)
  const install = useUpdate((s) => s.install)
  const dismiss = useUpdate((s) => s.dismiss)

  if (dismissed) return null
  if (status !== 'available' && status !== 'downloading' && status !== 'ready') return null

  return (
    <div className="fixed bottom-4 right-4 z-[70] w-80 rounded-2xl border border-line bg-surface p-4 shadow-2xl">
      {status === 'available' && (
        <>
          <div className="text-[13px] font-semibold text-ink">Update available</div>
          <p className="mt-1 text-[12px] text-muted">
            Clover Mail {version ? `v${version} ` : ''}is ready to download.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void download()}
              className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-ink"
            >
              Download
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-lg px-3 py-1.5 text-[12px] text-muted hover:text-ink"
            >
              Later
            </button>
          </div>
        </>
      )}

      {status === 'downloading' && (
        <>
          <div className="text-[13px] font-semibold text-ink">Downloading update…</div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${percent ?? 0}%` }}
            />
          </div>
          <div className="mt-1 text-right text-[11px] text-muted">{percent ?? 0}%</div>
        </>
      )}

      {status === 'ready' && (
        <>
          <div className="text-[13px] font-semibold text-ink">Update ready</div>
          <p className="mt-1 text-[12px] text-muted">
            Restart Clover Mail to install {version ? `v${version}` : 'the update'}.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={install}
              className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-ink"
            >
              Restart &amp; install
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-lg px-3 py-1.5 text-[12px] text-muted hover:text-ink"
            >
              Later
            </button>
          </div>
        </>
      )}
    </div>
  )
}
