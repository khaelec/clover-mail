import { useEffect, type ReactNode } from 'react'
import { SHORTCUTS, type ShortcutGroup } from '../lib/shortcuts'
import { IconClose } from './icons'

const GROUPS: ShortcutGroup[] = ['Navigation', 'Actions', 'Compose']

export function ShortcutHelp({ onClose }: { onClose: () => void }): ReactNode {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h3 className="text-[15px] font-semibold text-ink">Keyboard shortcuts</h3>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:text-ink"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto p-5">
          {GROUPS.map((group) => {
            const items = SHORTCUTS.filter((s) => s.group === group)
            if (items.length === 0) return null
            return (
              <div key={group} className="mb-4 last:mb-0">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  {group}
                </div>
                <div className="divide-y divide-line/60">
                  {items.map((s) => (
                    <div key={s.id} className="flex items-center justify-between py-1.5">
                      <span className="text-[13px] text-ink/90">{s.label}</span>
                      <kbd className="rounded-md border border-line bg-canvas/60 px-2 py-0.5 font-sans text-[11px] text-muted">
                        {s.display}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
