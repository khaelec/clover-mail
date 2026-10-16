import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { useMail } from '../state/mail'
import { useLayout } from '../state/layout'
import { useApps } from '../state/apps'
import { IMPORTANT_FOLDER_ID, JUNK_FOLDER_ID, OUTBOX_FOLDER_ID, UNIFIED_FOLDER_ID } from '@shared/mail'
import type { BulkActionType, FolderSummary, MessageDetail, MessageSummary, ThreadSummary } from '@shared/mail'
import { Reader } from './Reader'
import { Compose } from './Compose'
import { CopilotView } from './CopilotView'
import { AccountSetup } from './AccountSetup'
import { RulesModal } from './RulesModal'
import {
  IconArchive,
  IconClose,
  IconCompose,
  IconEye,
  IconFilter,
  IconFolderPlus,
  IconGrid,
  IconImportance,
  IconInbox,
  IconLayout,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconThreads,
  IconTrash,
  IconUnread,
  IconShield,
  IconSend
} from './icons'
import { ListHeader, MessageRow, SyncButton, SyncStatus, ThreadRow, formatListDate } from './MailList'
import { BenchProfiler } from '../bench'
import { useToasts } from '../state/toasts'
import { resolveShortcut } from '../lib/shortcuts'
import { ShortcutHelp } from './ShortcutHelp'
import {
  MailContextMenus,
  type ConfirmState,
  type FolderMenuState,
  type MessageMenuState,
  type PromptState,
  type ThreadMenuState
} from './MailContextMenus'
import { FolderPane } from './FolderPane'
import { MailToolbar } from './MailToolbar'

function Splitter({
  width,
  min,
  max,
  invert,
  onChange,
  onCommit
}: {
  width: number
  min: number
  max: number
  invert?: boolean
  onChange: (width: number) => void
  onCommit: () => void
}): ReactNode {
  const frame = useRef(0)
  return (
    <div
      onPointerDown={(e) => {
        e.preventDefault()
        const el = e.currentTarget
        const pointerId = e.pointerId
        const startX = e.clientX
        const startWidth = width
        el.setPointerCapture(pointerId)
        document.body.style.userSelect = 'none'
        document.body.style.cursor = 'col-resize'

        const move = (ev: PointerEvent): void => {
          const delta = ev.clientX - startX
          const next = Math.max(min, Math.min(max, invert ? startWidth - delta : startWidth + delta))
          if (frame.current) cancelAnimationFrame(frame.current)
          frame.current = requestAnimationFrame(() => onChange(next))
        }
        const finish = (): void => {
          el.removeEventListener('pointermove', move)
          el.removeEventListener('pointerup', finish)
          el.removeEventListener('pointercancel', finish)
          try {
            el.releasePointerCapture(pointerId)
          } catch {
            // already released
          }
          document.body.style.userSelect = ''
          document.body.style.cursor = ''
          onCommit()
        }

        el.addEventListener('pointermove', move)
        el.addEventListener('pointerup', finish)
        el.addEventListener('pointercancel', finish)
      }}
      style={{ touchAction: 'none' }}
      className="w-1.5 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-accent/40"
    />
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }): ReactNode {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="w-full max-w-md animate-fade-in rounded-3xl border border-line bg-surface/70 p-8 text-center backdrop-blur-xl">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent/12 text-accent ring-1 ring-accent/25">
          <IconInbox className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-lg font-semibold tracking-tight text-ink">Welcome to Clover Mail</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          Connect an IMAP/SMTP account to get started. Your password is encrypted with Windows DPAPI and
          never leaves this machine.
        </p>
        <button
          type="button"
          onClick={onAdd}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-accent-ink"
        >
          <IconPlus className="h-4 w-4" />
          Add account
        </button>
      </div>
    </div>
  )
}

function AppDock(): ReactNode {
  const apps = useApps((s) => s.apps)
  const load = useApps((s) => s.load)
  const layout = useLayout((s) => s.settings)
  const setLayout = useLayout((s) => s.set)
  const saveLayout = useLayout((s) => s.save)
  const isCopilot = layout.dockKind === 'copilot'
  const app = isCopilot ? null : (apps.find((a) => a.id === layout.dockAppId) ?? null)
  const setHost = useApps((s) => s.setHost)
  const slotRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!isCopilot && !layout.dockAppId && apps.length > 0) setLayout({ dockAppId: apps[0].id })
  }, [apps, layout.dockAppId, isCopilot, setLayout])

  useEffect(() => {
    const el = slotRef.current
    if (!el || isCopilot) return
    const update = (): void => {
      const rect = el.getBoundingClientRect()
      setHost({
        appId: app?.id ?? null,
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
  }, [app?.id, isCopilot, setHost])

  return (
    <>
      <Splitter
        width={layout.dockWidth}
        min={260}
        max={760}
        invert
        onChange={(w) => setLayout({ dockWidth: w })}
        onCommit={() => void saveLayout()}
      />
      <section
        className="flex min-w-0 shrink-0 flex-col overflow-hidden border-l border-line bg-surface"
        style={{ width: layout.dockWidth }}
      >
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <select
            value={isCopilot ? '__copilot__' : layout.dockAppId ?? ''}
            onChange={(e) => {
              if (e.target.value === '__copilot__') setLayout({ dockKind: 'copilot' })
              else setLayout({ dockKind: 'app', dockAppId: e.target.value })
            }}
            className="min-w-0 flex-1 rounded-md border border-line bg-canvas/60 px-2 py-1 text-[12px] text-ink outline-none"
          >
            <option value="__copilot__">Copilot</option>
            {apps.length === 0 && !isCopilot && (
              <option value="">No apps — add one in the Apps tab</option>
            )}
            {apps.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            title="Close panel"
            onClick={() => setLayout({ dockOpen: false })}
            className="grid h-7 w-7 place-items-center rounded-md text-muted hover:text-ink"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>
        {isCopilot ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            <CopilotView embedded />
          </div>
        ) : (
          <div ref={slotRef} data-clover-appslot className="relative min-h-0 min-w-0 flex-1 overflow-hidden" />
        )}
      </section>
    </>
  )
}

function escapeForHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Quoted original, rendered as a muted indented block so replies read cleanly. */
function buildQuote(detail: MessageDetail): string {
  const name = detail.fromName || detail.fromEmail || 'the sender'
  const when = new Date(detail.dateUtc ?? Date.now()).toLocaleString()
  const attribution = escapeForHtml(`On ${when}, ${name} wrote:`)
  const body = escapeForHtml(detail.textPlain ?? '').replace(/\n/g, '<br>') || '<em>(no text)</em>'
  return `<div data-clover-quote="1"><p>${attribution}</p><blockquote>${body}</blockquote></div>`
}

/** Forwarded message, rendered like a clean quote block. */
function buildForwardQuote(detail: MessageDetail): string {
  const header = escapeForHtml(
    [
      '---------- Forwarded message ----------',
      `From: ${detail.fromName ? `${detail.fromName} ` : ''}<${detail.fromEmail ?? ''}>`,
      `Date: ${new Date(detail.dateUtc ?? Date.now()).toLocaleString()}`,
      `Subject: ${detail.subject ?? ''}`,
      `To: ${detail.to.join(', ')}`
    ].join('\n')
  ).replace(/\n/g, '<br>')
  const body = escapeForHtml(detail.textPlain ?? '').replace(/\n/g, '<br>')
  return `<div data-clover-quote="1"><p>${header}</p><blockquote>${body}</blockquote></div>`
}

export function MailView(): ReactNode {
  const accounts = useMail((s) => s.accounts)
  const accountSync = useMail((s) => s.accountSync)
  const activeAccountId = useMail((s) => s.activeAccountId)
  const folders = useMail((s) => s.folders)
  const activeFolderId = useMail((s) => s.activeFolderId)
  const messages = useMail((s) => s.messages)
  const hasOlder = useMail((s) => s.hasOlder)
  const loadOlder = useMail((s) => s.loadOlder)
  const searchResults = useMail((s) => s.searchResults)
  const searchQuery = useMail((s) => s.searchQuery)
  const selectedMessageId = useMail((s) => s.selectedMessageId)
  const spamCount = useMail((s) => s.spamCount)
  const importantCount = useMail((s) => s.importantCount)
  const outbox = useMail((s) => s.outbox)
  const retryOutbox = useMail((s) => s.retryOutbox)
  const discardOutbox = useMail((s) => s.discardOutbox)
  const selectedIds = useMail((s) => s.selectedIds)
  const threaded = useMail((s) => s.threaded)
  const threads = useMail((s) => s.threads)
  const expandedThreadIds = useMail((s) => s.expandedThreadIds)
  const toggleThread = useMail((s) => s.toggleThread)
  const setThreaded = useMail((s) => s.setThreaded)
  const muteThread = useMail((s) => s.muteThread)
  const pinThread = useMail((s) => s.pinThread)
  const labels = useMail((s) => s.labels)
  const createLabel = useMail((s) => s.createLabel)
  const deleteLabel = useMail((s) => s.deleteLabel)
  const toggleLabel = useMail((s) => s.toggleLabel)
  const savedSearches = useMail((s) => s.savedSearches)
  const createSavedSearch = useMail((s) => s.createSavedSearch)
  const deleteSavedSearch = useMail((s) => s.deleteSavedSearch)
  const [showNewLabel, setShowNewLabel] = useState(false)
  const [labelName, setLabelName] = useState('')
  const [menuLabelIds, setMenuLabelIds] = useState<string[]>([])
  const [threadMenu, setThreadMenu] = useState<ThreadMenuState | null>(null)

  useEffect(() => {
    if (!threadMenu) return
    const close = (): void => setThreadMenu(null)
    window.addEventListener('resize', close)
    return () => window.removeEventListener('resize', close)
  }, [threadMenu])
  const layout = useLayout((s) => s.settings)
  const setLayout = useLayout((s) => s.set)
  const saveLayout = useLayout((s) => s.save)

  useEffect(() => {
    void useLayout.getState().load()
  }, [])

  const selectAccount = useMail((s) => s.selectAccount)
  const selectFolder = useMail((s) => s.selectFolder)
  const selectMessage = useMail((s) => s.selectMessage)
  const sync = useMail((s) => s.sync)
  const search = useMail((s) => s.search)
  const clearSearch = useMail((s) => s.clearSearch)
  const toggleFlag = useMail((s) => s.toggleFlag)
  const toggleImportant = useMail((s) => s.toggleImportant)
  const toggleSelect = useMail((s) => s.toggleSelect)
  const selectAll = useMail((s) => s.selectAll)
  const clearSelection = useMail((s) => s.clearSelection)
  const bulk = useMail((s) => s.bulk)
  const createFolder = useMail((s) => s.createFolder)
  const renameFolder = useMail((s) => s.renameFolder)
  const deleteFolder = useMail((s) => s.deleteFolder)
  const setFolderVisible = useMail((s) => s.setFolderVisible)
  const exportMbox = useMail((s) => s.exportMbox)
  const showHidden = useMail((s) => s.showHidden)
  const setShowHidden = useMail((s) => s.setShowHidden)

  const [showAdd, setShowAdd] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [folderName, setFolderName] = useState('')
  const bulkIds = useMail((s) => s.bulkIds)
  const emptyFolder = useMail((s) => s.emptyFolder)
  const markFolderRead = useMail((s) => s.markFolderRead)
  const syncFolder = useMail((s) => s.syncFolder)
  const emptyJunk = useMail((s) => s.emptyJunk)
  const unreadOnly = useMail((s) => s.unreadOnly)
  const setUnreadOnly = useMail((s) => s.setUnreadOnly)
  const [menu, setMenu] = useState<MessageMenuState | null>(null)
  const [folderMenu, setFolderMenu] = useState<FolderMenuState | null>(null)

  useEffect(() => {
    if (!menu && !folderMenu) return
    const close = (): void => {
      setMenu(null)
      setFolderMenu(null)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu, folderMenu])

  function openFolderMenu(e: ReactMouseEvent, folder: FolderSummary): void {
    e.preventDefault()
    e.stopPropagation()
    setFolderMenu({
      x: Math.min(e.clientX, window.innerWidth - 220),
      y: Math.min(e.clientY, window.innerHeight - 200),
      kind: 'folder',
      folder
    })
  }

  function openJunkMenu(e: ReactMouseEvent): void {
    e.preventDefault()
    e.stopPropagation()
    setFolderMenu({
      x: Math.min(e.clientX, window.innerWidth - 220),
      y: Math.min(e.clientY, window.innerHeight - 200),
      kind: 'junk'
    })
  }

  const openMessageMenu = useCallback((e: ReactMouseEvent, message: MessageSummary): void => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({
      x: Math.min(e.clientX, window.innerWidth - 220),
      y: Math.min(e.clientY, window.innerHeight - 280),
      message,
      mode: 'main'
    })
    setMenuLabelIds([])
  }, [])

  const openThreadMenu = useCallback((e: ReactMouseEvent, thread: ThreadSummary): void => {
    e.preventDefault()
    e.stopPropagation()
    setThreadMenu({
      x: Math.min(e.clientX, window.innerWidth - 220),
      // Room for the folder list when "Move to folder" is opened.
      y: Math.min(e.clientY, window.innerHeight - 320),
      thread
    })
  }, [])

  const menuTargets =
    menu && selectedIds.includes(menu.message.id) && selectedIds.length > 1
      ? selectedIds
      : menu
        ? [menu.message.id]
        : []

  function menuRun(action: BulkActionType, targetFolderId?: string): void {
    void bulkIds(menuTargets, action, targetFolderId)
    setMenu(null)
  }

  function menuDelete(): void {
    const count = menuTargets.length
    ask('Delete messages', `Move ${count} message${count === 1 ? '' : 's'} to Trash?`, () => {
      void bulkIds(menuTargets, 'trash')
      setMenu(null)
    })
  }
  const [composeState, setComposeState] = useState<{
    open: boolean
    to?: string
    cc?: string
    subject?: string
    body?: string
    quote?: string
    attachments?: { name: string; path: string }[]
    inReplyTo?: string
    references?: string
    /** UID of the draft being edited (so autosave/send update or delete it). */
    draftUid?: number
  }>({ open: false })
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  function scrollRowIntoView(messageId: string): void {
    const container = listRef.current
    if (!container) return
    const el = container.querySelector(`[data-row-key="${CSS.escape(messageId)}"]`)
    if (el instanceof HTMLElement) el.scrollIntoView({ block: 'nearest' })
  }

  // Kept in a ref so the window listener is bound once but always sees the latest
  // state and callbacks.
  const shortcutRef = useRef<(e: KeyboardEvent) => void>(() => undefined)
  shortcutRef.current = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null
    const typing =
      !!target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault()
      searchRef.current?.focus()
      searchRef.current?.select()
      return
    }
    if (typing) return
    const id = resolveShortcut(e)
    if (!id) return
    const store = useMail.getState()

    if (id === 'next' || id === 'prev') {
      // Walk the same rows the list shows (threads or messages), so j/k works in
      // both views and scrolls the newly selected row into sight.
      const isSynthetic = [JUNK_FOLDER_ID, IMPORTANT_FOLDER_ID, OUTBOX_FOLDER_ID].includes(
        store.activeFolderId ?? ''
      )
      const isDrafts = store.folders.find((f) => f.id === store.activeFolderId)?.specialUse === 'drafts'
      const threadsView = store.threaded && !isSynthetic && !isDrafts && !store.searchResults
      const ids = threadsView
        ? store.threads
            .filter((t) => !store.unreadOnly || t.unreadCount > 0)
            .map((t) => t.messages[t.messages.length - 1]?.id)
            .filter((x): x is string => !!x)
        : (store.searchResults ?? store.messages)
            .filter((m) => !store.unreadOnly || !m.isRead)
            .map((m) => m.id)
      if (ids.length === 0) return
      const idx = ids.indexOf(store.selectedMessageId ?? '')
      const next = id === 'next' ? Math.min(ids.length - 1, idx + 1) : Math.max(0, idx - 1)
      const targetId = ids[next]
      if (targetId) {
        void store.selectMessage(targetId)
        requestAnimationFrame(() => scrollRowIntoView(targetId))
      }
    } else if (id === 'search') {
      e.preventDefault()
      searchRef.current?.focus()
    } else if (id === 'compose') {
      e.preventDefault()
      setComposeState({ open: true })
    } else if (id === 'help') {
      e.preventDefault()
      setShowHelp(true)
    } else if (id === 'reply') {
      if (store.detail) void openReply()
    } else if (id === 'replyAll') {
      if (store.detail) void openReplyAll()
    } else if (id === 'forward') {
      if (store.detail) void openForward()
    } else if (id === 'archive') {
      if (store.detail) void store.bulkIds([store.detail.id], 'archive')
    } else if (id === 'delete') {
      if (store.detail) void store.bulkIds([store.detail.id], 'trash')
    } else if (id === 'star') {
      if (store.detail) void store.toggleFlag(store.detail)
    } else if (id === 'unread') {
      if (store.detail && store.detail.isRead) void store.toggleRead(store.detail)
    } else if (id === 'escape') {
      if (showHelp) {
        setShowHelp(false)
      } else if (composeState.open) {
        setComposeState({ open: false })
      } else if (!menu && !folderMenu && !threadMenu && !confirm && !prompt && store.detail) {
        // Menus/prompts close themselves on Escape; only clear the reader.
        useMail.setState({ selectedMessageId: null, detail: null, conversation: [] })
      }
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => shortcutRef.current(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // The bell's Reply action selects a message and then fires this.
  useEffect(() => {
    const handler = (): void => void openReply()
    window.addEventListener('clover:reply-now', handler)
    return () => window.removeEventListener('clover:reply-now', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeAccount = useMemo(
    () => accounts.find((a) => a.id === activeAccountId) ?? null,
    [accounts, activeAccountId]
  )
  const list = searchResults ?? messages
  const isSynthetic = activeFolderId === JUNK_FOLDER_ID || activeFolderId === IMPORTANT_FOLDER_ID || activeFolderId === OUTBOX_FOLDER_ID
  const isDrafts = folders.find((f) => f.id === activeFolderId)?.specialUse === 'drafts'
  const showingThreads = threaded && !isSynthetic && !isDrafts && !searchResults
  const visibleList = unreadOnly ? list.filter((m) => !m.isRead) : list
  const visibleThreads = unreadOnly ? threads.filter((t) => t.unreadCount > 0) : threads

  // Split the list into Unread and Read sections (only when both exist and we're
  // not already filtering to unread-only).
  const unreadThreads = visibleThreads.filter((t) => t.unreadCount > 0)
  const readThreads = visibleThreads.filter((t) => t.unreadCount === 0)
  const unreadMessages = visibleList.filter((m) => !m.isRead)
  const readMessages = visibleList.filter((m) => m.isRead)
  const splitThreads = !unreadOnly && unreadThreads.length > 0 && readThreads.length > 0
  const splitMessages = !unreadOnly && unreadMessages.length > 0 && readMessages.length > 0
  const visibleFolders = showHidden ? folders : folders.filter((f) => f.isVisible)

  // Built once per render so each row only does a Set lookup, not an array scan.
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  // Stable callbacks so memoized rows skip re-rendering when unrelated state
  // (selection, sync status, …) changes.
  const handleSelectMessage = useCallback((messageId: string): void => {
    const store = useMail.getState()
    const folder = store.folders.find((f) => f.id === store.activeFolderId)
    // A draft opens in the compose window (to edit and send), not the reader.
    if ((folder?.specialUse ?? '') === 'drafts') {
      void (async () => {
        const detail = await window.clover.mail.getMessage(messageId).catch(() => null)
        if (!detail) return
        setComposeState({
          open: true,
          to: detail.to.join(', '),
          cc: detail.cc.join(', '),
          subject: detail.subject ?? '',
          body: detail.textPlain ?? '',
          draftUid: detail.uid
        })
      })()
      return
    }
    void store.selectMessage(messageId)
  }, [])
  const handleToggleThread = useCallback((threadId: string): void => {
    useMail.getState().toggleThread(threadId)
  }, [])
  const handleMessageDragStart = useCallback(
    (e: ReactDragEvent<HTMLDivElement>, message: MessageSummary): void => {
      const ids = useMail.getState().selectedIds
      const dragIds = ids.includes(message.id) && ids.length > 1 ? ids : [message.id]
      e.dataTransfer.setData('application/x-clover-messages', JSON.stringify(dragIds))
      e.dataTransfer.effectAllowed = 'move'
    },
    []
  )

  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [prompt, setPrompt] = useState<PromptState | null>(null)
  function ask(title: string, body: string, action: () => void): void {
    setConfirm({ title, body, action })
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (query.trim()) void search(query)
      else clearSearch()
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, search, clearSearch])

  if (accounts.length === 0) {
    return (
      <>
        <EmptyState onAdd={() => setShowAdd(true)} />
        {showAdd && <AccountSetup onClose={() => setShowAdd(false)} />}
      </>
    )
  }

  // Reply targets the sender of the open message; Reply all covers everyone in
  // the conversation. Both fall back to the thread's other participants when the
  // open message was sent by you (so you never reply to yourself).
  function replySubject(subject: string | null | undefined): string {
    return subject?.startsWith('Re:') ? subject : `Re: ${subject ?? ''}`
  }

  function senderAddress(detail: { fromName: string | null; fromEmail: string | null }): string {
    if (!detail.fromEmail) return ''
    return detail.fromName ? `${detail.fromName} <${detail.fromEmail}>` : detail.fromEmail
  }

  function emailOf(addr: string): string {
    return (addr.match(/<([^>]+)>/)?.[1] ?? addr).trim().toLowerCase()
  }

  function replyFields(detail: MessageDetail): { subject: string; inReplyTo?: string; references?: string } {
    return {
      subject: replySubject(detail.subject),
      inReplyTo: detail.messageId ?? undefined,
      references: [detail.refs, detail.messageId].filter(Boolean).join(' ') || undefined
    }
  }

  // Everyone in the conversation, minus me: the thread's participants (across
  // From/To/Cc of every message) plus the open message's own To/Cc as a floor,
  // de-duplicated. Falls back gracefully when a thread isn't grouped.
  async function replyRecipients(detail: MessageDetail): Promise<string[]> {
    const self = activeAccount?.email?.toLowerCase()
    const seen = new Set<string>()
    const out: string[] = []
    const push = (addr: string): void => {
      const key = emailOf(addr)
      if (!key || (self && key === self) || seen.has(key)) return
      seen.add(key)
      out.push(addr.trim())
    }
    const participants = await window.clover.mail
      .threadParticipants(detail.id)
      .catch(() => [] as string[])
    for (const p of participants) push(p)
    for (const a of [...detail.to, ...detail.cc]) push(a)
    return out
  }

  async function openReply(): Promise<void> {
    const detail = useMail.getState().detail
    if (!detail) return
    const self = activeAccount?.email?.toLowerCase()
    let to = senderAddress(detail)
    if (!to || (self && emailOf(to) === self)) {
      const recipients = await replyRecipients(detail)
      to = recipients[0] ?? to
    }
    setComposeState({ open: true, to, quote: buildQuote(detail), ...replyFields(detail) })
  }

  async function openReplyAll(): Promise<void> {
    const detail = useMail.getState().detail
    if (!detail) return
    const self = activeAccount?.email?.toLowerCase()
    const recipients = await replyRecipients(detail)
    let to = senderAddress(detail)
    const rest = recipients.filter((p) => emailOf(p) !== (to ? emailOf(to) : ''))
    if (!to || (self && emailOf(to) === self)) to = rest.shift() ?? ''
    setComposeState({ open: true, to, cc: rest.join(', '), quote: buildQuote(detail), ...replyFields(detail) })
  }

  async function openForward(): Promise<void> {
    const detail = useMail.getState().detail
    if (!detail) return
    const attachments: { name: string; path: string }[] = []
    for (const att of detail.attachments) {
      if (att.isInline || !att.available) continue
      const path = await window.clover.mail.getAttachmentPath(att.id)
      if (path) attachments.push({ name: att.filename ?? 'attachment', path })
    }
    setComposeState({
      open: true,
      subject: detail.subject
        ? detail.subject.toLowerCase().startsWith('fwd:')
          ? detail.subject
          : `Fwd: ${detail.subject}`
        : '',
      quote: buildForwardQuote(detail),
      attachments
    })
  }

  function threadRowProps(t: ThreadSummary): ReactNode {
    return (
      <ThreadRow
        key={t.threadId}
        thread={t}
        activeChildId={t.messages.some((m) => m.id === selectedMessageId) ? selectedMessageId : null}
        isExpanded={expandedThreadIds.includes(t.threadId)}
        onSelect={handleSelectMessage}
        onToggleExpand={handleToggleThread}
        onContextMenu={openThreadMenu}
        onMessageContextMenu={openMessageMenu}
      />
    )
  }

  function messageRowProps(m: MessageSummary): ReactNode {
    return (
      <MessageRow
        key={m.id}
        message={m}
        isActive={m.id === selectedMessageId}
        isSelected={selectedSet.has(m.id)}
        onSelect={handleSelectMessage}
        onContextMenu={openMessageMenu}
        onDragStart={handleMessageDragStart}
        onToggleSelect={toggleSelect}
        onToggleImportant={toggleImportant}
        onToggleFlag={toggleFlag}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0">
      <FolderPane
        onCompose={() => setComposeState({ open: true })}
        onAddAccount={() => setShowAdd(true)}
        openFolderMenu={openFolderMenu}
        openJunkMenu={openJunkMenu}
        query={query}
        setQuery={setQuery}
        ask={ask}
      />

      {layout.showFolders && (
        <Splitter
          width={layout.foldersWidth}
          min={170}
          max={420}
          onChange={(w) => setLayout({ foldersWidth: w })}
          onCommit={() => void saveLayout()}
        />
      )}

      <section
        className="flex shrink-0 flex-col border-r border-line bg-surface"
        style={{ width: layout.listWidth }}
      >
        <MailToolbar
          query={query}
          setQuery={setQuery}
          onShowRules={() => setShowRules(true)}
          searchRef={searchRef}
        />
        <SyncStatus />

        {selectedIds.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-accent/8 px-3 py-2 text-[12px]">
            <span className="mr-1 font-medium text-accent">{selectedIds.length} selected</span>
            <button type="button" onClick={() => void bulk('archive')} className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-muted hover:text-ink">
              <IconArchive className="h-3.5 w-3.5" /> Archive
            </button>
            <button
              type="button"
              onClick={() =>
                ask(
                  'Delete messages',
                  `Move ${selectedIds.length} message${selectedIds.length === 1 ? '' : 's'} to Trash?`,
                  () => void bulk('trash')
                )
              }
              className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-muted hover:text-rose-500"
            >
              <IconTrash className="h-3.5 w-3.5" /> Delete
            </button>
            <button type="button" onClick={() => void bulk('markRead')} className="rounded-md border border-line px-2 py-1 text-muted hover:text-ink">
              Read
            </button>
            <button type="button" onClick={() => void bulk('markUnread')} className="rounded-md border border-line px-2 py-1 text-muted hover:text-ink">
              Unread
            </button>
            <button type="button" onClick={() => void bulk('markImportant')} className="rounded-md border border-line px-2 py-1 text-muted hover:text-accent">
              Important
            </button>
            <select
              onChange={(e) => {
                if (e.target.value) {
                  void bulk('move', e.target.value)
                  e.target.value = ''
                }
              }}
              defaultValue=""
              className="rounded-md border border-line bg-canvas/60 px-2 py-1 text-[12px] text-ink outline-none"
            >
              <option value="">Move to…</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <button type="button" onClick={selectAll} className="rounded-md border border-line px-2 py-1 text-muted hover:text-ink">
              All
            </button>
            <button type="button" onClick={clearSelection} className="ml-auto rounded-md px-2 py-1 text-muted hover:text-ink">
              Clear
            </button>
          </div>
        ) : null}

        <div
          ref={listRef}
          role="listbox"
          aria-label="Messages"
          aria-multiselectable
          tabIndex={0}
          className="min-h-0 flex-1 overflow-y-auto outline-none"
        >
          <BenchProfiler>
          {showingThreads &&
            (visibleThreads.length === 0 ? (
              <div className="px-4 py-10 text-center text-[12px] text-muted">
                No messages. Hit sync to fetch.
              </div>
            ) : splitThreads ? (
              <>
                <ListHeader label="Unread" count={unreadThreads.length} />
                {unreadThreads.map(threadRowProps)}
                <ListHeader label="Read" count={readThreads.length} />
                {readThreads.map(threadRowProps)}
              </>
            ) : (
              visibleThreads.map(threadRowProps)
            ))}

          {searchQuery && selectedIds.length === 0 ? (
          <div className="flex items-center gap-2 border-b border-line bg-accent/8 px-3 py-1.5 text-[12px] text-accent">
            <span>
              {searchResults ? searchResults.length : 0} result{(searchResults?.length ?? 0) === 1 ? '' : 's'} for “{searchQuery}”
            </span>
            <button type="button" onClick={clearSearch} className="ml-auto text-muted hover:text-ink">
              Clear
            </button>
          </div>
        ) : null}

        {activeFolderId === OUTBOX_FOLDER_ID && (
          <div>
            {outbox.length === 0 ? (
              <div className="px-4 py-10 text-center text-[12px] text-muted">
                Nothing waiting to send. Messages appear here if a send is queued, scheduled or fails.
              </div>
            ) : (
              outbox.map((item) => (
                <div key={item.id} className="flex items-start gap-3 border-b border-line/70 px-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-medium text-ink">
                        {item.subject || '(no subject)'}
                      </span>
                      <span
                        className={
                          'shrink-0 rounded-full px-1.5 text-[10px] ' +
                          (item.status === 'failed'
                            ? 'bg-rose-500/15 text-rose-500'
                            : item.status === 'sending'
                              ? 'bg-accent/15 text-accent'
                              : 'bg-canvas/70 text-muted ring-1 ring-line')
                        }
                      >
                        {item.status === 'failed'
                          ? 'Failed'
                          : item.status === 'sending'
                            ? 'Sending'
                            : item.sendAt > Date.now()
                              ? 'Scheduled'
                              : 'Queued'}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[12px] text-muted">
                      to {item.to.join(', ') || '(no recipient)'}
                    </div>
                    {item.status === 'failed' && item.error && (
                      <div className="mt-0.5 truncate text-[11px] text-rose-500">{item.error}</div>
                    )}
                    <div className="mt-0.5 text-[11px] text-muted">
                      {item.sendAt > Date.now()
                        ? `Scheduled for ${formatListDate(item.sendAt)}`
                        : `Queued ${formatListDate(item.createdAt)}`}
                      {item.attempts > 0 ? ` · ${item.attempts} attempt${item.attempts > 1 ? 's' : ''}` : ''}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void retryOutbox(item.id)}
                      className="rounded-md border border-line px-2 py-1 text-[11px] text-muted hover:text-accent"
                    >
                      Send now
                    </button>
                    <button
                      type="button"
                      onClick={() => void discardOutbox(item.id)}
                      className="rounded-md border border-line px-2 py-1 text-[11px] text-muted hover:text-rose-500"
                    >
                      Discard
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {!showingThreads && activeFolderId !== OUTBOX_FOLDER_ID && visibleList.length === 0 && (
            <div className="px-4 py-10 text-center text-[12px] text-muted">
              {searchQuery
                ? 'No results.'
                : activeFolderId
                  ? 'No cached messages. Hit sync to fetch.'
                  : 'Select a folder.'}
            </div>
          )}
          {!showingThreads && activeFolderId !== OUTBOX_FOLDER_ID && splitMessages && (
            <>
              <ListHeader label="Unread" count={unreadMessages.length} />
              {unreadMessages.map(messageRowProps)}
              <ListHeader label="Read" count={readMessages.length} />
              {readMessages.map(messageRowProps)}
            </>
          )}
          {!showingThreads && activeFolderId !== OUTBOX_FOLDER_ID && !splitMessages && visibleList.map(messageRowProps)}

          {hasOlder && !searchQuery && activeFolderId !== OUTBOX_FOLDER_ID && (
            <div className="flex justify-center p-3">
              <button
                type="button"
                onClick={() => void loadOlder()}
                className="rounded-lg border border-line px-4 py-2 text-[12px] text-muted hover:border-accent hover:text-accent"
              >
                Load older messages
              </button>
            </div>
          )}
          </BenchProfiler>
        </div>
      </section>

      <Splitter
        width={layout.listWidth}
        min={260}
        max={680}
        onChange={(w) => setLayout({ listWidth: w })}
        onCommit={() => void saveLayout()}
      />

      <Reader onReply={openReply} onReplyAll={openReplyAll} onForward={() => void openForward()} />

      {layout.dockOpen && <AppDock />}

      {composeState.open && activeAccountId && (
        <Compose
          accountId={activeAccountId}
          accountEmail={activeAccount?.email}
          initialTo={composeState.to}
          initialCc={composeState.cc}
          initialSubject={composeState.subject}
          initialBody={composeState.body}
          initialDraftUid={composeState.draftUid}
          initialQuote={composeState.quote}
          initialAttachments={composeState.attachments}
          inReplyTo={composeState.inReplyTo}
          references={composeState.references}
          onClose={() => setComposeState({ open: false })}
        />
      )}
      {showAdd && <AccountSetup onClose={() => setShowAdd(false)} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
      {showHelp && <ShortcutHelp onClose={() => setShowHelp(false)} />}

      <MailContextMenus
        menu={menu}
        setMenu={setMenu}
        threadMenu={threadMenu}
        setThreadMenu={setThreadMenu}
        folderMenu={folderMenu}
        setFolderMenu={setFolderMenu}
        prompt={prompt}
        setPrompt={setPrompt}
        confirm={confirm}
        setConfirm={setConfirm}
        menuLabelIds={menuLabelIds}
        setMenuLabelIds={setMenuLabelIds}
        onForward={() => void openForward()}
        ask={ask}
      />
    </div>
  )
}
