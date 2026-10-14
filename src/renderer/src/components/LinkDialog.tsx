import { useEffect, useState, type ReactNode } from 'react'

/** Small in-app prompt — Electron disables window.prompt, so we use this instead. */
export function LinkDialog({
  open,
  onCancel,
  onSubmit
}: {
  open: boolean
  onCancel: () => void
  onSubmit: (url: string) => void
}): ReactNode {
  const [url, setUrl] = useState('')

  useEffect(() => {
    if (open) setUrl('')
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm"
      onMouseDown={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-line bg-surface p-4 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 className="text-[13px] font-semibold text-ink">Insert link</h3>
        <input
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit(url)
            else if (e.key === 'Escape') onCancel()
          }}
          placeholder="https://example.com"
          className="mt-2 w-full rounded-lg border border-line bg-canvas/60 px-3 py-2 text-[13px] text-ink outline-none focus:border-accent"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-muted hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSubmit(url)}
            className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-accent-ink"
          >
            Insert
          </button>
        </div>
      </div>
    </div>
  )
}
