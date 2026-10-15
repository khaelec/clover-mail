import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  CloverMark,
  IconArchive,
  IconBell,
  IconClose,
  IconGrid,
  IconMail,
  IconMaximize,
  IconMinimize,
  IconRefresh,
  IconReply,
  IconRestore
} from './icons'
import { useNotifications, type AppNotification } from '../state/notifications'
import { useApps } from '../state/apps'
import { useMail } from '../state/mail'
import { sendToApp } from '../lib/appWebviews'

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

type Filter = 'all' | 'mail' | 'app' | 'system'

function matchesFilter(n: AppNotification, filter: Filter): boolean {
  if (filter === 'all') return true
  if (filter === 'mail') return n.kind === 'mail'
  if (filter === 'app') return n.kind === 'app'
  return n.kind === 'system' || n.kind === 'update'
}

function ItemIcon({ n, icon }: { n: AppNotification; icon: string | null }): ReactNode {
  if (n.kind === 'app' && icon) {
    return <img src={icon} alt="" className="h-4 w-4 shrink-0 rounded" />
  }
  const Icon = n.kind === 'mail' ? IconMail : n.kind === 'app' ? IconGrid : IconRefresh
  return <Icon className="h-4 w-4 shrink-0 text-muted" />
}

export function TitleBar(): ReactNode {
  const [maximized, setMaximized] = useState(false)
  const [open, setOpen] = useState(false)
  const [panel, setPanel] = useState<{ top: number; right: number } | null>(null)
  const [dnd, setDnd] = useState(false)
  const bellRef = useRef<HTMLButtonElement>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const items = useNotifications((s) => s.items)
  const markRead = useNotifications((s) => s.markRead)
  const markAllRead = useNotifications((s) => s.markAllRead)
  const removeItem = useNotifications((s) => s.remove)
  const clear = useNotifications((s) => s.clear)
  const apps = useApps((s) => s.apps)
  const unread = items.filter((i) => !i.read).length

  useEffect(() => {
    void window.clover.window.isMaximized().then(setMaximized)
    return window.clover.window.onMaximizedChanged(setMaximized)
  }, [])

  useEffect(() => {
    void window.clover.settings.get('notifications.dnd').then((v) => setDnd(v === true))
  }, [])

  function closePanel(): void {
    setOpen(false)
    setPanel(null)
  }

  function toggle(): void {
    if (open) {
      closePanel()
      return
    }
    // The panel is rendered in a portal (below), so position it under the bell.
    const rect = bellRef.current?.getBoundingClientRect()
    setPanel({
      top: (rect?.bottom ?? 44) + 6,
      right: Math.max(8, window.innerWidth - (rect?.right ?? window.innerWidth))
    })
    setOpen(true)
  }

  // Close on resize so the fixed panel never floats away from the bell.
  useEffect(() => {
    if (!open) return
    window.addEventListener('resize', closePanel)
    return () => window.removeEventListener('resize', closePanel)
  }, [open])

  function toggleDnd(): void {
    const next = !dnd
    setDnd(next)
    void window.clover.settings.set('notifications.dnd', next)
  }

  function appIcon(appId?: string): string | null {
    if (!appId) return null
    return apps.find((a) => a.id === appId)?.iconDataUrl ?? null
  }

  function itemTitle(n: AppNotification): string {
    if (n.kind === 'app' && (n.count ?? 1) > 1) {
      return `${n.appName ?? 'App'} · ${n.count} new messages`
    }
    return n.title
  }

  // Mail opens the conversation; an app opens that app and asks its page to run
  // the notification's onclick (jumping to the chat).
  function openItem(n: AppNotification): void {
    markRead(n.id)
    setOpen(false)
    if (n.kind === 'mail' && n.messageId && n.accountId) {
      window.dispatchEvent(
        new CustomEvent('clover:open-message', {
          detail: { accountId: n.accountId, messageId: n.messageId }
        })
      )
    } else if (n.kind === 'app' && n.appId) {
      useNotifications.getState().markAppRead(n.appId)
      window.dispatchEvent(new CustomEvent('clover:open-app', { detail: { appId: n.appId } }))
      if (n.appNotifId) sendToApp(n.appId, 'clover-trigger-notification', n.appNotifId)
    } else if (n.nav) {
      // Reminders open the calendar; update notices open Settings, etc.
      window.dispatchEvent(new CustomEvent('clover:navigate', { detail: { section: n.nav } }))
    }
  }

  function replyItem(n: AppNotification): void {
    markRead(n.id)
    setOpen(false)
    if (n.messageId) {
      window.dispatchEvent(
        new CustomEvent('clover:open-message', {
          detail: { accountId: n.accountId, messageId: n.messageId, reply: true }
        })
      )
    }
  }

  function archiveItem(n: AppNotification): void {
    if (n.messageId) void useMail.getState().bulkIds([n.messageId], 'archive')
    removeItem(n.id)
  }

  function readItem(n: AppNotification): void {
    if (n.messageId) void useMail.getState().bulkIds([n.messageId], 'markRead')
    markRead(n.id)
  }

  const shown = items.filter((i) => matchesFilter(i, filter))

  return (
    <header className="app-drag flex h-11 shrink-0 items-center gap-2 border-b border-line bg-surface/70 pl-3 pr-2 backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <CloverMark />
        <span className="text-[13px] font-semibold tracking-tight text-ink">Clover Mail</span>
      </div>

      <div className="ml-auto flex items-center gap-0.5">
        <div className="app-no-drag relative">
          <button
            ref={bellRef}
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
          {open &&
            panel &&
            createPortal(
              <>
                <div className="fixed inset-0 z-[90]" onClick={closePanel} />
                <div
                  className="fixed z-[100] w-80 overflow-hidden rounded-xl border border-line bg-surface text-ink shadow-2xl"
                  style={{ top: panel.top, right: panel.right }}
                >
                  <div className="flex items-center gap-2 border-b border-line px-3 py-2">
                    <span className="text-[12px] font-semibold">Notifications</span>
                    <button
                      type="button"
                      onClick={toggleDnd}
                      aria-pressed={dnd}
                      title={dnd ? 'Do Not Disturb is on — no OS popups' : 'Do Not Disturb'}
                      className={
                        'rounded-md px-1.5 py-0.5 text-[10px] ' +
                        (dnd ? 'bg-accent/15 font-medium text-accent' : 'text-muted hover:text-ink')
                      }
                    >
                      DND
                    </button>
                    <div className="ml-auto flex items-center gap-2">
                      {unread > 0 && (
                        <button
                          type="button"
                          onClick={markAllRead}
                          className="text-[11px] text-muted hover:text-ink"
                        >
                          Mark all read
                        </button>
                      )}
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
                  </div>
                  <div className="flex items-center gap-1 border-b border-line px-3 py-1.5">
                    {(['all', 'mail', 'app', 'system'] as Filter[]).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setFilter(f)}
                        aria-pressed={filter === f}
                        className={
                          'rounded-md px-2 py-0.5 text-[11px] ' +
                          (filter === f
                            ? 'bg-accent/12 font-medium text-accent'
                            : 'text-muted hover:text-ink')
                        }
                      >
                        {f === 'all' ? 'All' : f === 'mail' ? 'Mail' : f === 'app' ? 'Apps' : 'System'}
                      </button>
                    ))}
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {shown.length === 0 ? (
                      <div className="px-4 py-8 text-center">
                        <div className="text-[12.5px] font-medium text-ink">You&apos;re all caught up</div>
                        <div className="mt-1 text-[11.5px] text-muted">
                          New mail, app messages and reminders show up here.
                        </div>
                      </div>
                    ) : (
                      shown.map((n) => {
                        const clickable = n.kind === 'mail' ? !!n.messageId : n.kind === 'app'
                        return (
                          <div
                            key={n.id}
                            className={
                              'group relative border-b border-line/60 ' + (!n.read ? 'bg-accent/[0.06]' : '')
                            }
                          >
                            <button
                              type="button"
                              onClick={() => openItem(n)}
                              className={
                                'block w-full px-3 py-2 text-left transition-colors ' +
                                (clickable ? 'hover:bg-black/5 dark:hover:bg-white/10' : 'cursor-default')
                              }
                            >
                              <div className="flex items-center gap-2">
                                {!n.read && (
                                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                                )}
                                <ItemIcon n={n} icon={appIcon(n.appId)} />
                                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">
                                  {itemTitle(n)}
                                </span>
                                <span className="shrink-0 text-[10px] text-muted">{timeAgo(n.at)}</span>
                              </div>
                              {n.body && (
                                <div className="mt-0.5 line-clamp-2 pl-[18px] text-[11.5px] text-muted">
                                  {n.body}
                                </div>
                              )}
                            </button>
                            <div className="absolute right-1 top-1 flex items-center gap-0.5 rounded-md bg-surface/90 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                              {n.kind === 'mail' && n.messageId && (
                                <>
                                  <button
                                    type="button"
                                    title="Archive"
                                    aria-label="Archive"
                                    onClick={() => archiveItem(n)}
                                    className="grid h-6 w-6 place-items-center rounded text-muted hover:text-ink"
                                  >
                                    <IconArchive className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    title="Mark read"
                                    aria-label="Mark read"
                                    onClick={() => readItem(n)}
                                    className="grid h-6 w-6 place-items-center rounded text-muted hover:text-ink"
                                  >
                                    <IconMail className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    title="Reply"
                                    aria-label="Reply"
                                    onClick={() => replyItem(n)}
                                    className="grid h-6 w-6 place-items-center rounded text-muted hover:text-ink"
                                  >
                                    <IconReply className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                title="Dismiss"
                                aria-label="Dismiss"
                                onClick={() => removeItem(n.id)}
                                className="grid h-6 w-6 place-items-center rounded text-muted hover:text-ink"
                              >
                                <IconClose className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              </>,
              document.body
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
