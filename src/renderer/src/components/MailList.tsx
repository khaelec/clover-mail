import {
  memo,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode
} from 'react'
import type { MessageSummary, ThreadSummary } from '@shared/mail'
import { useMail } from '../state/mail'
import { IconImportance, IconPaperclip, IconRefresh, IconStar } from './icons'
import { benchBump } from '../bench'

export function formatListDate(value: number | null): string {
  if (!value) return ''
  const date = new Date(value)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  if (sameDay) return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' })
  })
}

// Keep every row in the page, but let the browser skip layout and paint for the
// ones that are off-screen. Drag, right-click, select-all and scrollIntoView all
// keep working because the DOM is unchanged.
const ROW_STYLE: CSSProperties = { contentVisibility: 'auto', containIntrinsicSize: 'auto 72px' }

export const ListHeader = memo(function ListHeader({
  label,
  count
}: {
  label: string
  count: number
}): ReactNode {
  return (
    <div
      role="presentation"
      className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface/95 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted backdrop-blur"
    >
      {label}
      <span className="rounded-full bg-canvas/70 px-1.5 text-[10px] font-normal text-muted ring-1 ring-line">
        {count}
      </span>
    </div>
  )
})

interface ThreadRowProps {
  thread: ThreadSummary
  activeChildId: string | null
  isExpanded: boolean
  onSelect: (messageId: string) => void
  onToggleExpand: (threadId: string) => void
  onContextMenu: (e: ReactMouseEvent, thread: ThreadSummary) => void
  onMessageContextMenu: (e: ReactMouseEvent, message: MessageSummary) => void
}

export const ThreadRow = memo(function ThreadRow({
  thread: t,
  activeChildId,
  isExpanded,
  onSelect,
  onToggleExpand,
  onContextMenu,
  onMessageContextMenu
}: ThreadRowProps): ReactNode {
  if (__CLOVER_BENCH__) benchBump('threadRow')
  const latest = t.messages[t.messages.length - 1]
  return (
    <div
      role="presentation"
      className={
        'border-b border-line/70 ' +
        (t.isImportant ? 'border-l-2 border-l-accent' : 'border-l-2 border-l-transparent')
      }
      style={ROW_STYLE}
    >
      <div
        role="option"
        aria-selected={activeChildId !== null}
        onClick={() => latest && onSelect(latest.id)}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onContextMenu(e, t)
        }}
        data-row-key={latest?.id ?? t.threadId}
        draggable
        onDragStart={(e: ReactDragEvent<HTMLDivElement>) => {
          e.dataTransfer.setData(
            'application/x-clover-messages',
            JSON.stringify(t.messages.map((x) => x.id))
          )
          e.dataTransfer.effectAllowed = 'move'
        }}
        className={
          'flex cursor-pointer gap-2 px-3 py-2.5 transition-colors ' +
          (activeChildId
            ? 'bg-accent/8'
            : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]')
        }
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {t.unreadCount > 0 && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
            <span className={'truncate text-[13px] ' + (t.unreadCount > 0 ? 'font-semibold text-ink' : 'text-ink/85')}>
              {t.fromName || t.fromEmail || '(unknown sender)'}
            </span>
            {t.messageCount > 1 && (
              <span className="shrink-0 rounded-full bg-canvas/70 px-1.5 text-[10px] text-muted ring-1 ring-line">
                {t.messageCount}
              </span>
            )}
            {t.pinned && (
              <span className="shrink-0 rounded bg-accent/15 px-1 text-[9px] font-semibold text-accent" title="Pinned">
                PIN
              </span>
            )}
            {t.muted && (
              <span className="shrink-0 rounded bg-line px-1 text-[9px] font-semibold text-muted" title="Muted">
                MUTE
              </span>
            )}
            {t.hasAttachments && <IconPaperclip className="h-3.5 w-3.5 shrink-0 text-muted" />}
            <span className="ml-auto shrink-0 text-[11px] text-muted">{formatListDate(t.lastDate)}</span>
          </div>
          <div className={'mt-0.5 truncate text-[13px] ' + (t.unreadCount > 0 ? 'font-medium text-ink' : 'text-muted')}>
            {t.subject || '(no subject)'}
          </div>
          {!isExpanded && latest?.snippet && (
            <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted">{latest.snippet}</div>
          )}
        </div>
        {t.messageCount > 1 && (
          <button
            type="button"
            title={isExpanded ? 'Collapse conversation' : 'Expand conversation'}
            aria-label={isExpanded ? 'Collapse conversation' : 'Expand conversation'}
            aria-expanded={isExpanded}
            onClick={(e) => {
              e.stopPropagation()
              onToggleExpand(t.threadId)
            }}
            className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] text-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/10"
          >
            {isExpanded ? '▾' : '▸'}
          </button>
        )}
      </div>

      {isExpanded && t.messageCount > 1 && (
        <div className="bg-canvas/30">
          {[...t.messages].reverse().map((m) => (
            <div
              key={m.id}
              role="option"
              aria-selected={m.id === activeChildId}
              onClick={() => onSelect(m.id)}
              onContextMenu={(e) => onMessageContextMenu(e, m)}
              className={
                'flex cursor-pointer items-center gap-2 border-t border-line/60 py-1.5 pl-7 pr-3 ' +
                (m.id === activeChildId
                  ? 'bg-accent/8'
                  : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]')
              }
            >
              <span className={'w-28 shrink-0 truncate text-[11px] ' + (m.isRead ? 'text-muted' : 'font-medium text-ink')}>
                {m.fromName || m.fromEmail}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-ink/80">{m.snippet || ''}</span>
              <span className="shrink-0 text-[10px] text-muted">{formatListDate(m.dateUtc)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

interface MessageRowProps {
  message: MessageSummary
  isActive: boolean
  isSelected: boolean
  onSelect: (messageId: string) => void
  onContextMenu: (e: ReactMouseEvent, message: MessageSummary) => void
  onDragStart: (e: ReactDragEvent<HTMLDivElement>, message: MessageSummary) => void
  onToggleSelect: (messageId: string) => void
  onToggleImportant: (message: MessageSummary) => void
  onToggleFlag: (message: MessageSummary) => void
}

export const MessageRow = memo(function MessageRow({
  message: m,
  isActive,
  isSelected,
  onSelect,
  onContextMenu,
  onDragStart,
  onToggleSelect,
  onToggleImportant,
  onToggleFlag
}: MessageRowProps): ReactNode {
  if (__CLOVER_BENCH__) benchBump('messageRow')
  return (
    <div
      role="option"
      aria-selected={isActive}
      onClick={() => onSelect(m.id)}
      onContextMenu={(e) => onContextMenu(e, m)}
      data-row-key={m.id}
      draggable
      onDragStart={(e) => onDragStart(e, m)}
      style={ROW_STYLE}
      className={
        'group flex cursor-pointer gap-2 border-b border-line/70 px-3 py-2.5 transition-colors ' +
        (m.isImportant ? 'border-l-2 border-l-accent ' : 'border-l-2 border-l-transparent ') +
        (isActive ? 'bg-accent/8' : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]')
      }
    >
      <input
        type="checkbox"
        aria-label={`Select message from ${m.fromName || m.fromEmail || 'sender'}`}
        checked={isSelected}
        onClick={(e) => e.stopPropagation()}
        onChange={() => onToggleSelect(m.id)}
        className={
          'mt-1 h-3.5 w-3.5 shrink-0 accent-[var(--accent)] transition-opacity ' +
          (isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')
        }
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {!m.isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
          <span className={'truncate text-[13px] ' + (m.isRead ? 'text-ink/85' : 'font-semibold text-ink')}>
            {m.fromName || m.fromEmail || '(unknown sender)'}
          </span>
          {m.hasAttachments && <IconPaperclip className="h-3.5 w-3.5 shrink-0 text-muted" />}
          <span className="ml-auto flex shrink-0 items-center gap-1">
            <button
              type="button"
              title="Mark important"
              aria-label={m.isImportant ? 'Remove important' : 'Mark important'}
              aria-pressed={m.isImportant}
              onClick={(e) => {
                e.stopPropagation()
                onToggleImportant(m)
              }}
              className="grid h-5 w-5 place-items-center"
            >
              <IconImportance
                className={'h-3.5 w-3.5 ' + (m.isImportant ? 'text-accent' : 'text-muted/40 hover:text-accent')}
              />
            </button>
            <button
              type="button"
              title="Star"
              aria-label={m.isFlagged ? 'Unstar' : 'Star'}
              aria-pressed={m.isFlagged}
              onClick={(e) => {
                e.stopPropagation()
                onToggleFlag(m)
              }}
              className="grid h-5 w-5 place-items-center"
            >
              <IconStar
                className={'h-3.5 w-3.5 ' + (m.isFlagged ? 'text-amber-400' : 'text-muted/40 hover:text-amber-400')}
              />
            </button>
            <span className="text-[11px] text-muted">{formatListDate(m.dateUtc)}</span>
          </span>
        </div>
        <div className={'mt-0.5 truncate text-[13px] ' + (m.isRead ? 'text-muted' : 'font-medium text-ink')}>
          {m.subject || '(no subject)'}
        </div>
        {m.snippet && <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted">{m.snippet}</div>}
      </div>
    </div>
  )
})

/** Isolated so sync status/error churn doesn't re-render the message list. */
export function SyncStatus(): ReactNode {
  const status = useMail((s) => s.status)
  const error = useMail((s) => s.error)
  return (
    <>
      {status && /error/i.test(status) && (
        <div className="border-b border-line px-3.5 py-1 text-[11px] text-rose-500">{status}</div>
      )}
      {error && <div className="border-b border-line px-3.5 py-1 text-[11px] text-rose-500">{error}</div>}
    </>
  )
}

/** Its own component so the spinning icon doesn't re-render the whole view. */
export const SyncButton = memo(function SyncButton({ onSync }: { onSync: () => void }): ReactNode {
  const syncing = useMail((s) => s.syncing)
  return (
    <button
      type="button"
      title="Sync now"
      aria-label="Sync now"
      onClick={onSync}
      className="grid h-7 w-7 place-items-center rounded-md text-muted hover:text-accent"
    >
      <IconRefresh className={syncing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
    </button>
  )
})
