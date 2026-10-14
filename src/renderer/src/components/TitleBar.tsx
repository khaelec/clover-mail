import { useEffect, useState, type ReactNode } from 'react'
import {
  CloverMark,
  IconBell,
  IconClose,
  IconMaximize,
  IconMinimize,
  IconRestore
} from './icons'
import { useNotifications } from '../state/notifications'

function WindowButton({
  onClick,
  danger,
  label,
  children
}: {
  onClick: () => void
  danger?: boolean
  label: string
  children: ReactNode
}): ReactNode {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={
        'app-no-drag grid h-8 w-10 place-items-center rounded-md text-muted transition-colors ' +
        (danger
          ? 'hover:bg-rose-500 hover:text-white'
          : 'hover:bg-black/5 hover:text-ink dark:hover:bg-white/10')
      }
    >
      {children}
    </button>
  )
}

function timeAgo(at: number): string {
  const minutes = Math.floor((Date.now() - at) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(at).toLocaleDateString()
}

export function TitleBar(): ReactNode {
  const [maximized, setMaximized] = useState(false)
  const [open, setOpen] = useState(false)
  const items = useNotifications((s) => s.items)
  const markAllRead = useNotifications((s) => s.markAllRead)
  const clear = useNotifications((s) => s.clear)
  const unread = items.filter((i) => !i.read).length

  useEffect(() => {
    void window.clover.window.isMaximized().then(setMaximized)
    return window.clover.window.onMaximizedChanged(setMaximized)
  }, [])

  function toggle(): void {
    const next = !open
    setOpen(next)
    if (next) markAllRead()
  }

  return (
    <header className="app-drag flex h-11 shrink-0 items-center gap-2 border-b border-line bg-surface/70 pl-3 pr-2 backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <CloverMark />
        <span className="text-[13px] font-semibold tracking-tight text-ink">Clover Mail</span>
      </div>

      <div className="ml-auto flex items-center gap-0.5">
        <div className="app-no-drag relative">
          <button
            type="button"
            aria-label="Notifications"
            title="Notifications"
            onClick={toggle}
            className="relative grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/10"
          >
            <IconBell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-semibold text-white">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
              <div className="absolute right-0 top-9 z-50 w-80 overflow-hidden rounded-xl border border-line bg-surface text-ink shadow-2xl">
                <div className="flex items-center justify-between border-b border-line px-3 py-2">
                  <span className="text-[12px] font-semibold">Notifications</span>
                  {items.length > 0 && (
                    <button
                      type="button"
                      onClick={clear}
                      className="text-[11px] text-muted hover:text-ink"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {items.length === 0 ? (
                    <div className="px-3 py-6 text-center text-[12px] text-muted">
                      No notifications yet.
                    </div>
                  ) : (
                    items.map((n) => (
                      <div key={n.id} className="border-b border-line/60 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={
                              'shrink-0 rounded px-1 text-[9px] font-semibold ' +
                              (n.kind === 'mail'
                                ? 'bg-accent/15 text-accent'
                                : n.kind === 'update'
                                  ? 'bg-amber-500/15 text-amber-600'
                                  : 'bg-canvas/70 text-muted ring-1 ring-line')
                            }
                          >
                            {n.kind === 'mail' ? 'MAIL' : n.kind === 'update' ? 'UPDATE' : 'APP'}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">
                            {n.title}
                          </span>
                          <span className="shrink-0 text-[10px] text-muted">{timeAgo(n.at)}</span>
                        </div>
                        {n.body && (
                          <div className="mt-0.5 line-clamp-2 text-[11.5px] text-muted">{n.body}</div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <WindowButton label="Minimize" onClick={() => window.clover.window.minimize()}>
          <IconMinimize />
        </WindowButton>
        <WindowButton
          label={maximized ? 'Restore' : 'Maximize'}
          onClick={() => window.clover.window.toggleMaximize()}
        >
          {maximized ? <IconRestore /> : <IconMaximize />}
        </WindowButton>
        <WindowButton label="Close" danger onClick={() => window.clover.window.close()}>
          <IconClose />
        </WindowButton>
      </div>
    </header>
  )
}
