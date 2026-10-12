import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { useMail } from '../state/mail'
import { useLayout } from '../state/layout'
import { useApps } from '../state/apps'
import { IMPORTANT_FOLDER_ID, JUNK_FOLDER_ID, UNIFIED_FOLDER_ID } from '@shared/mail'
import type { BulkActionType, FolderSummary, MessageSummary } from '@shared/mail'
import { Reader } from './Reader'
import { Compose } from './Compose'
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
  IconPaperclip,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconStar,
  IconThreads,
  IconTrash,
  IconUnread,
  IconShield
} from './icons'

function formatListDate(value: number | null): string {
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

function folderIcon(folder: FolderSummary): ReactNode {
  if (folder.specialUse === 'trash') return <IconTrash className="h-4 w-4" />
  return <IconInbox className="h-4 w-4" />
}

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

function MenuItem({
  onClick,
  danger,
  children
}: {
  onClick: () => void
  danger?: boolean
  children: ReactNode
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-black/5 dark:hover:bg-white/10 ' +
        (danger ? 'text-rose-500' : 'text-ink')
      }
    >
      {children}
    </button>
  )
}

function MenuDivider(): ReactNode {
  return <div className="my-1 h-px bg-line" />
}

function AppDock(): ReactNode {
  const apps = useApps((s) => s.apps)
  const load = useApps((s) => s.load)
  const layout = useLayout((s) => s.settings)
  const setLayout = useLayout((s) => s.set)
  const saveLayout = useLayout((s) => s.save)
  const hostRef = useRef<HTMLDivElement>(null)
  const app = apps.find((a) => a.id === layout.dockAppId) ?? null

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!layout.dockAppId && apps.length > 0) setLayout({ dockAppId: apps[0].id })
  }, [apps, layout.dockAppId, setLayout])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    host.innerHTML = ''
    if (app) {
      const webview = document.createElement('webview')
      webview.setAttribute('src', app.url)
      webview.setAttribute('partition', `persist:app-${app.id}`)
      webview.setAttribute('allowpopups', 'true')
      webview.style.width = '100%'
      webview.style.height = '100%'
      host.appendChild(webview)
    }
    return () => {
      host.innerHTML = ''
    }
  }, [app, app?.id, app?.url])

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
      <section className="flex min-w-0 shrink-0 flex-col overflow-hidden border-l border-line" style={{ width: layout.dockWidth }}>
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <select
            value={layout.dockAppId ?? ''}
            onChange={(e) => setLayout({ dockAppId: e.target.value })}
            className="min-w-0 flex-1 rounded-md border border-line bg-canvas/60 px-2 py-1 text-[12px] text-ink outline-none"
          >
            {apps.length === 0 && <option value="">No apps — add one in the Apps tab</option>}
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
        <div ref={hostRef} className="min-h-0 min-w-0 flex-1 overflow-hidden" />
      </section>
    </>
  )
}

export function MailView(): ReactNode {
  const accounts = useMail((s) => s.accounts)
  const activeAccountId = useMail((s) => s.activeAccountId)
  const folders = useMail((s) => s.folders)
  const activeFolderId = useMail((s) => s.activeFolderId)
  const messages = useMail((s) => s.messages)
  const searchResults = useMail((s) => s.searchResults)
  const searchQuery = useMail((s) => s.searchQuery)
  const selectedMessageId = useMail((s) => s.selectedMessageId)
  const syncing = useMail((s) => s.syncing)
  const status = useMail((s) => s.status)
  const error = useMail((s) => s.error)
  const spamCount = useMail((s) => s.spamCount)
  const importantCount = useMail((s) => s.importantCount)
  const selectedIds = useMail((s) => s.selectedIds)
  const threaded = useMail((s) => s.threaded)
  const threads = useMail((s) => s.threads)
  const expandedThreadIds = useMail((s) => s.expandedThreadIds)
  const toggleThread = useMail((s) => s.toggleThread)
  const setThreaded = useMail((s) => s.setThreaded)
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
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [folderName, setFolderName] = useState('')
  const bulkIds = useMail((s) => s.bulkIds)
  const emptyFolder = useMail((s) => s.emptyFolder)
  const markFolderRead = useMail((s) => s.markFolderRead)
  const syncFolder = useMail((s) => s.syncFolder)
  const emptyJunk = useMail((s) => s.emptyJunk)
  const unreadOnly = useMail((s) => s.unreadOnly)
  const setUnreadOnly = useMail((s) => s.setUnreadOnly)
  const [menu, setMenu] = useState<{
    x: number
    y: number
    message: MessageSummary
    mode: 'main' | 'move'
  } | null>(null)
  const [folderMenu, setFolderMenu] = useState<{
    x: number
    y: number
    kind: 'folder' | 'junk'
    folder?: FolderSummary
  } | null>(null)

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

  function openMenu(e: ReactMouseEvent, message: MessageSummary): void {
    e.preventDefault()
    e.stopPropagation()
    const x = Math.min(e.clientX, window.innerWidth - 220)
    const y = Math.min(e.clientY, window.innerHeight - 280)
    setMenu({ x, y, message, mode: 'main' })
  }

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
    subject?: string
    body?: string
    attachments?: { name: string; path: string }[]
  }>({ open: false })
  const [query, setQuery] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activeAccount = useMemo(
    () => accounts.find((a) => a.id === activeAccountId) ?? null,
    [accounts, activeAccountId]
  )
  const list = searchResults ?? messages
  const isSynthetic = activeFolderId === JUNK_FOLDER_ID || activeFolderId === IMPORTANT_FOLDER_ID
  const showingThreads = threaded && !isSynthetic && !searchResults
  const visibleList = unreadOnly ? list.filter((m) => !m.isRead) : list
  const visibleThreads = unreadOnly ? threads.filter((t) => t.unreadCount > 0) : threads
  const visibleFolders = showHidden ? folders : folders.filter((f) => f.isVisible)

  const [confirm, setConfirm] = useState<{ title: string; body: string; action: () => void } | null>(
    null
  )
  const [prompt, setPrompt] = useState<{
    title: string
    value: string
    onSubmit: (value: string) => void
  } | null>(null)
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

  function openReply(): void {
    const detail = useMail.getState().detail
    if (!detail) return
    const to = detail.fromEmail ? `${detail.fromName ? `${detail.fromName} <${detail.fromEmail}>` : detail.fromEmail}` : ''
    const body = `\n\nOn ${new Date(detail.dateUtc ?? Date.now()).toLocaleString()}, ${detail.fromName || detail.fromEmail} wrote:\n> ${(detail.textPlain ?? '').split('\n').join('\n> ')}`
    setComposeState({
      open: true,
      to,
      subject: detail.subject?.startsWith('Re:') ? detail.subject : `Re: ${detail.subject ?? ''}`,
      body
    })
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
    const header = [
      '',
      '',
      '---------- Forwarded message ----------',
      `From: ${detail.fromName ? `${detail.fromName} ` : ''}<${detail.fromEmail ?? ''}>`,
      `Date: ${new Date(detail.dateUtc ?? Date.now()).toLocaleString()}`,
      `Subject: ${detail.subject ?? ''}`,
      `To: ${detail.to.join(', ')}`,
      ''
    ].join('\n')
    setComposeState({
      open: true,
      subject: detail.subject
        ? detail.subject.toLowerCase().startsWith('fwd:')
          ? detail.subject
          : `Fwd: ${detail.subject}`
        : '',
      body: header + (detail.textPlain ?? ''),
      attachments
    })
  }

  return (
    <div className="flex h-full min-h-0">
      {layout.showFolders && (
      <aside
        className="flex shrink-0 flex-col border-r border-line"
        style={{ width: layout.foldersWidth }}
      >
        <div className="border-b border-line p-2.5">
          {accounts.map((account) => {
            const active = account.id === activeAccountId
            return (
              <button
                key={account.id}
                type="button"
                onClick={() => void selectAccount(account.id)}
                className={
                  'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] transition-colors ' +
                  (active ? 'bg-accent/12 text-accent' : 'text-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/10')
                }
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: account.color ?? 'var(--accent)' }}
                />
                <span className="truncate">{account.email}</span>
              </button>
            )
          })}
        </div>

        <button
          type="button"
          onClick={() => setComposeState({ open: true })}
          className="m-2.5 flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-accent-ink shadow-sm"
        >
          <IconCompose className="h-4 w-4" />
          Compose
        </button>

        <div className="flex items-center justify-between px-3.5 pb-1 pt-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Folders</span>
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              title={showHidden ? 'Hide hidden folders' : 'Show hidden folders'}
              onClick={() => setShowHidden(!showHidden)}
              className={showHidden ? 'text-accent' : 'text-muted hover:text-accent'}
            >
              <IconEye className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="New folder"
              onClick={() => setShowNewFolder((v) => !v)}
              className="text-muted hover:text-accent"
            >
              <IconFolderPlus className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
        {showNewFolder && (
          <div className="flex items-center gap-1 px-2.5 pb-1.5">
            <input
              autoFocus
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && folderName.trim()) {
                  void createFolder(folderName)
                  setFolderName('')
                  setShowNewFolder(false)
                }
              }}
              placeholder="Folder name"
              className="flex-1 rounded-lg border border-line bg-canvas/60 px-2.5 py-1.5 text-[12px] text-ink outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => {
                void createFolder(folderName)
                setFolderName('')
                setShowNewFolder(false)
              }}
              className="rounded-lg bg-accent px-2.5 py-1.5 text-[12px] font-medium text-accent-ink"
            >
              Add
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3">
          <button
            type="button"
            onClick={() => void selectFolder(UNIFIED_FOLDER_ID)}
            className={
              'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ' +
              (activeFolderId === UNIFIED_FOLDER_ID
                ? 'bg-accent/12 font-medium text-accent'
                : 'text-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/10')
            }
          >
            <span className="flex min-w-0 items-center gap-2">
              <IconInbox className="h-4 w-4" />
              <span className="truncate">Unified Inbox</span>
            </span>
          </button>
          {visibleFolders.map((folder) => {
            const active = folder.id === activeFolderId
            return (
              <button
                key={folder.id}
                type="button"
                onClick={() => void selectFolder(folder.id)}
                onContextMenu={(e) => openFolderMenu(e, folder)}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  const raw = e.dataTransfer.getData('application/x-clover-messages')
                  if (raw) void bulkIds(JSON.parse(raw) as string[], 'move', folder.id)
                }}
                className={
                  'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ' +
                  (active ? 'bg-accent/12 font-medium text-accent' : 'text-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/10')
                }
              >
                <span className="flex min-w-0 items-center gap-2">
                  {folderIcon(folder)}
                  <span className="truncate">{folder.name}</span>
                </span>
                {folder.unreadCount > 0 && (
                  <span className={'shrink-0 text-[11px] ' + (active ? 'text-accent' : 'text-muted')}>
                    {folder.unreadCount}
                  </span>
                )}
              </button>
            )
          })}

          <button
            type="button"
            onClick={() => void selectFolder(JUNK_FOLDER_ID)}
            onContextMenu={(e) => openJunkMenu(e)}
            className={
              'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ' +
              (activeFolderId === JUNK_FOLDER_ID
                ? 'bg-accent/12 font-medium text-accent'
                : 'text-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/10')
            }
          >
            <span className="flex min-w-0 items-center gap-2">
              <IconShield className="h-4 w-4" />
              <span className="truncate">Junk</span>
            </span>
            {spamCount > 0 && (
              <span className={'shrink-0 text-[11px] ' + (activeFolderId === JUNK_FOLDER_ID ? 'text-accent' : 'text-muted')}>
                {spamCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => void selectFolder(IMPORTANT_FOLDER_ID)}
            className={
              'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ' +
              (activeFolderId === IMPORTANT_FOLDER_ID
                ? 'bg-accent/12 font-medium text-accent'
                : 'text-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/10')
            }
          >
            <span className="flex min-w-0 items-center gap-2">
              <IconImportance className="h-4 w-4" />
              <span className="truncate">Important</span>
            </span>
            {importantCount > 0 && (
              <span className={'shrink-0 text-[11px] ' + (activeFolderId === IMPORTANT_FOLDER_ID ? 'text-accent' : 'text-muted')}>
                {importantCount}
              </span>
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 border-t border-line px-3.5 py-2.5 text-[12px] text-muted hover:text-ink"
        >
          <IconPlus className="h-3.5 w-3.5" />
          Add account
        </button>
      </aside>
      )}

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
        className="flex shrink-0 flex-col border-r border-line"
        style={{ width: layout.listWidth }}
      >
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <IconSearch className="h-4 w-4 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search mail"
            className="w-full bg-transparent text-[13px] text-ink placeholder:text-muted focus:outline-none"
          />
          <button
            type="button"
            title={threaded ? 'Group by conversation' : 'Show individual messages'}
            onClick={() => void setThreaded(!threaded)}
            className={
              'grid h-7 w-7 place-items-center rounded-md ' +
              (threaded ? 'text-accent' : 'text-muted hover:text-accent')
            }
          >
            <IconThreads className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Unread only"
            onClick={() => setUnreadOnly(!unreadOnly)}
            className={
              'grid h-7 w-7 place-items-center rounded-md ' +
              (unreadOnly ? 'text-accent' : 'text-muted hover:text-accent')
            }
          >
            <IconUnread className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Toggle folder pane"
            onClick={() => {
              setLayout({ showFolders: !layout.showFolders })
              void saveLayout()
            }}
            className={
              'grid h-7 w-7 place-items-center rounded-md ' +
              (layout.showFolders ? 'text-accent' : 'text-muted hover:text-accent')
            }
          >
            <IconLayout className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Open app beside the reader"
            onClick={() => {
              setLayout({ dockOpen: !layout.dockOpen })
              void saveLayout()
            }}
            className={
              'grid h-7 w-7 place-items-center rounded-md ' +
              (layout.dockOpen ? 'text-accent' : 'text-muted hover:text-accent')
            }
          >
            <IconGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Rules & workflow"
            onClick={() => setShowRules(true)}
            className="grid h-7 w-7 place-items-center rounded-md text-muted hover:text-accent"
          >
            <IconFilter className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Sync now"
            onClick={() => void sync()}
            className="grid h-7 w-7 place-items-center rounded-md text-muted hover:text-accent"
          >
            <IconRefresh className={syncing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          </button>
        </div>
        {status && <div className="border-b border-line px-3.5 py-1 text-[11px] text-muted">{status}</div>}
        {error && <div className="border-b border-line px-3.5 py-1 text-[11px] text-rose-500">{error}</div>}

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

        <div className="min-h-0 flex-1 overflow-y-auto">
          {showingThreads &&
            (visibleThreads.length === 0 ? (
              <div className="px-4 py-10 text-center text-[12px] text-muted">
                No messages. Hit sync to fetch.
              </div>
            ) : (
              visibleThreads.map((t) => {
                const expanded = expandedThreadIds.includes(t.threadId)
                const single = t.messages.length === 1
                const latest = t.messages[t.messages.length - 1]
                return (
                  <div
                    key={t.threadId}
                    className={
                      'border-b border-line/70 ' +
                      (t.isImportant ? 'border-l-2 border-l-accent' : 'border-l-2 border-l-transparent')
                    }
                  >
                    <div
                      onClick={() =>
                        single && latest ? void selectMessage(latest.id) : toggleThread(t.threadId)
                      }
                      onContextMenu={(e) => latest && openMenu(e, latest)}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          'application/x-clover-messages',
                          JSON.stringify(t.messages.map((x) => x.id))
                        )
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                      className={
                        'flex cursor-pointer gap-2 px-3 py-2.5 transition-colors ' +
                        (single && latest?.id === selectedMessageId
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
                          {t.hasAttachments && <IconPaperclip className="h-3.5 w-3.5 shrink-0 text-muted" />}
                          <span className="ml-auto shrink-0 text-[11px] text-muted">{formatListDate(t.lastDate)}</span>
                        </div>
                        <div className={'mt-0.5 truncate text-[13px] ' + (t.unreadCount > 0 ? 'font-medium text-ink' : 'text-muted')}>
                          {t.subject || '(no subject)'}
                        </div>
                        {!expanded && latest?.snippet && (
                          <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted">{latest.snippet}</div>
                        )}
                      </div>
                      {t.messageCount > 1 && (
                        <span className="mt-1 shrink-0 text-[10px] text-muted">{expanded ? '▾' : '▸'}</span>
                      )}
                    </div>

                    {expanded && t.messageCount > 1 && (
                      <div className="bg-canvas/30">
                        {t.messages.map((m) => (
                          <div
                            key={m.id}
                            onClick={() => void selectMessage(m.id)}
                            onContextMenu={(e) => openMenu(e, m)}
                            className={
                              'flex cursor-pointer items-center gap-2 border-t border-line/60 py-1.5 pl-7 pr-3 ' +
                              (m.id === selectedMessageId
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
            ))}

          {!showingThreads && visibleList.length === 0 && (
            <div className="px-4 py-10 text-center text-[12px] text-muted">
              {searchQuery
                ? 'No results.'
                : activeFolderId
                  ? 'No cached messages. Hit sync to fetch.'
                  : 'Select a folder.'}
            </div>
          )}
          {!showingThreads && visibleList.map((m: MessageSummary) => {
            const active = m.id === selectedMessageId
            const selected = selectedIds.includes(m.id)
            return (
              <div
                key={m.id}
                onClick={() => void selectMessage(m.id)}
                onContextMenu={(e) => openMenu(e, m)}
                draggable
                onDragStart={(e) => {
                  const ids = selectedIds.includes(m.id) && selectedIds.length > 1 ? selectedIds : [m.id]
                  e.dataTransfer.setData('application/x-clover-messages', JSON.stringify(ids))
                  e.dataTransfer.effectAllowed = 'move'
                }}
                className={
                  'group flex cursor-pointer gap-2 border-b border-line/70 px-3 py-2.5 transition-colors ' +
                  (m.isImportant ? 'border-l-2 border-l-accent ' : 'border-l-2 border-l-transparent ') +
                  (active ? 'bg-accent/8' : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]')
                }
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleSelect(m.id)}
                  className={
                    'mt-1 h-3.5 w-3.5 shrink-0 accent-[var(--accent)] transition-opacity ' +
                    (selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')
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
                        onClick={(e) => {
                          e.stopPropagation()
                          void toggleImportant(m)
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
                        onClick={(e) => {
                          e.stopPropagation()
                          void toggleFlag(m)
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
          })}
        </div>
      </section>

      <Splitter
        width={layout.listWidth}
        min={260}
        max={680}
        onChange={(w) => setLayout({ listWidth: w })}
        onCommit={() => void saveLayout()}
      />

      <Reader onReply={openReply} onForward={() => void openForward()} />

      {layout.dockOpen && <AppDock />}

      {composeState.open && activeAccountId && (
        <Compose
          accountId={activeAccountId}
          accountEmail={activeAccount?.email}
          initialTo={composeState.to}
          initialSubject={composeState.subject}
          initialBody={composeState.body}
          initialAttachments={composeState.attachments}
          onClose={() => setComposeState({ open: false })}
        />
      )}
      {showAdd && <AccountSetup onClose={() => setShowAdd(false)} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}

      {menu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu(null)
            }}
          />
          <div
            className="fixed z-50 w-52 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-2xl"
            style={{ left: menu.x, top: menu.y }}
          >
            {menu.mode === 'main' ? (
              <>
                <MenuItem
                  onClick={() => {
                    void selectMessage(menu.message.id)
                    setMenu(null)
                  }}
                >
                  Open
                </MenuItem>
                <MenuItem onClick={() => menuRun(menu.message.isRead ? 'markUnread' : 'markRead')}>
                  {menu.message.isRead ? 'Mark as unread' : 'Mark as read'}
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    void toggleImportant(menu.message)
                    setMenu(null)
                  }}
                >
                  {menu.message.isImportant ? 'Remove important' : 'Mark as important'}
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    void toggleFlag(menu.message)
                    setMenu(null)
                  }}
                >
                  {menu.message.isFlagged ? 'Unstar' : 'Star'}
                </MenuItem>
                <MenuDivider />
                <MenuItem onClick={() => menuRun('archive')}>Archive</MenuItem>
                <MenuItem
                  onClick={() => {
                    void (async () => {
                      await selectMessage(menu.message.id)
                      await openForward()
                    })()
                    setMenu(null)
                  }}
                >
                  Forward
                </MenuItem>
                <MenuItem onClick={() => setMenu({ ...menu, mode: 'move' })}>Move to folder ›</MenuItem>
                <MenuItem danger onClick={menuDelete}>
                  Delete
                </MenuItem>
              </>
            ) : (
              <>
                <MenuItem onClick={() => setMenu({ ...menu, mode: 'main' })}>‹ Back</MenuItem>
                <MenuDivider />
                <div className="max-h-64 overflow-y-auto">
                  {folders.map((folder) => (
                    <MenuItem key={folder.id} onClick={() => menuRun('move', folder.id)}>
                      {folder.name}
                    </MenuItem>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {folderMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setFolderMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault()
              setFolderMenu(null)
            }}
          />
          <div
            className="fixed z-50 w-52 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-2xl"
            style={{ left: folderMenu.x, top: folderMenu.y }}
          >
            {folderMenu.kind === 'junk' ? (
              <MenuItem
                danger
                onClick={() => {
                  setFolderMenu(null)
                  ask('Empty Junk', 'Permanently delete all messages in Junk?', () => void emptyJunk())
                }}
              >
                Empty Junk
              </MenuItem>
            ) : (
              <>
                <MenuItem
                  onClick={() => {
                    if (folderMenu.folder) void syncFolder(folderMenu.folder.id)
                    setFolderMenu(null)
                  }}
                >
                  Sync now
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    if (folderMenu.folder) void markFolderRead(folderMenu.folder.id)
                    setFolderMenu(null)
                  }}
                >
                  Mark all as read
                </MenuItem>
                <MenuDivider />
                <MenuItem
                  onClick={() => {
                    const folder = folderMenu.folder
                    setFolderMenu(null)
                    if (folder) void exportMbox(folder.id)
                  }}
                >
                  Export to mbox…
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    const folder = folderMenu.folder
                    setFolderMenu(null)
                    if (folder) void setFolderVisible(folder.id, !folder.isVisible)
                  }}
                >
                  {folderMenu.folder?.isVisible ? 'Hide folder' : 'Show folder'}
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setFolderMenu(null)
                    setPrompt({
                      title: 'New folder',
                      value: '',
                      onSubmit: (v) => {
                        if (v.trim()) void createFolder(v)
                      }
                    })
                  }}
                >
                  New folder…
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    const folder = folderMenu.folder
                    setFolderMenu(null)
                    if (folder) {
                      setPrompt({
                        title: 'Rename folder',
                        value: folder.name,
                        onSubmit: (v) => {
                          if (v.trim()) void renameFolder(folder.id, v)
                        }
                      })
                    }
                  }}
                >
                  Rename…
                </MenuItem>
                {folderMenu.folder?.specialUse !== 'trash' && folderMenu.folder?.specialUse !== 'inbox' && (
                  <MenuItem
                    danger
                    onClick={() => {
                      const folder = folderMenu.folder
                      setFolderMenu(null)
                      if (folder) {
                        ask('Delete folder', `Delete the folder “${folder.name}”?`, () =>
                          void deleteFolder(folder.id)
                        )
                      }
                    }}
                  >
                    Delete folder
                  </MenuItem>
                )}
                {folderMenu.folder?.specialUse === 'trash' && (
                  <>
                    <MenuDivider />
                    <MenuItem
                      danger
                      onClick={() => {
                        const id = folderMenu.folder?.id
                        setFolderMenu(null)
                        if (id) {
                          ask('Empty Trash', 'Permanently delete everything in Trash?', () =>
                            void emptyFolder(id)
                          )
                        }
                      }}
                    >
                      Empty Trash
                    </MenuItem>
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}

      {prompt && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-2xl">
            <h3 className="text-[15px] font-semibold text-ink">{prompt.title}</h3>
            <input
              autoFocus
              value={prompt.value}
              onChange={(e) => setPrompt({ ...prompt, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const value = prompt.value
                  const submit = prompt.onSubmit
                  setPrompt(null)
                  submit(value)
                }
                if (e.key === 'Escape') setPrompt(null)
              }}
              className="mt-3 w-full rounded-lg border border-line bg-canvas/60 px-3 py-2 text-[13px] text-ink outline-none focus:border-accent"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPrompt(null)}
                className="rounded-lg px-3.5 py-2 text-[13px] text-muted hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const value = prompt.value
                  const submit = prompt.onSubmit
                  setPrompt(null)
                  submit(value)
                }}
                className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-2xl">
            <h3 className="text-[15px] font-semibold text-ink">{confirm.title}</h3>
            <p className="mt-1.5 text-[13px] text-muted">{confirm.body}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                className="rounded-lg px-3.5 py-2 text-[13px] text-muted hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const action = confirm.action
                  setConfirm(null)
                  action()
                }}
                className="rounded-lg bg-rose-500 px-4 py-2 text-[13px] font-semibold text-white"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
