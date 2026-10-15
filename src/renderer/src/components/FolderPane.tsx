import { useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { useMail } from '../state/mail'
import { useLayout } from '../state/layout'
import { IMPORTANT_FOLDER_ID, JUNK_FOLDER_ID, OUTBOX_FOLDER_ID, UNIFIED_FOLDER_ID } from '@shared/mail'
import type { FolderSummary } from '@shared/mail'
import {
  IconCompose,
  IconEye,
  IconFolderPlus,
  IconImportance,
  IconInbox,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSend,
  IconShield,
  IconTrash
} from './icons'

function syncAgo(at: number): string {
  const minutes = Math.floor((Date.now() - at) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(at).toLocaleDateString()
}

function folderIcon(folder: FolderSummary): ReactNode {
  if (folder.specialUse === 'trash') return <IconTrash className="h-4 w-4" />
  return <IconInbox className="h-4 w-4" />
}

export function FolderPane({
  onCompose,
  onAddAccount,
  openFolderMenu,
  openJunkMenu,
  query,
  setQuery,
  ask
}: {
  onCompose: () => void
  onAddAccount: () => void
  openFolderMenu: (e: ReactMouseEvent, folder: FolderSummary) => void
  openJunkMenu: (e: ReactMouseEvent) => void
  query: string
  setQuery: (q: string) => void
  ask: (title: string, body: string, action: () => void) => void
}): ReactNode {
  const accounts = useMail((s) => s.accounts)
  const accountSync = useMail((s) => s.accountSync)
  const activeAccountId = useMail((s) => s.activeAccountId)
  const selectAccount = useMail((s) => s.selectAccount)
  const folders = useMail((s) => s.folders)
  const activeFolderId = useMail((s) => s.activeFolderId)
  const selectFolder = useMail((s) => s.selectFolder)
  const showHidden = useMail((s) => s.showHidden)
  const setShowHidden = useMail((s) => s.setShowHidden)
  const createFolder = useMail((s) => s.createFolder)
  const labels = useMail((s) => s.labels)
  const createLabel = useMail((s) => s.createLabel)
  const deleteLabel = useMail((s) => s.deleteLabel)
  const savedSearches = useMail((s) => s.savedSearches)
  const createSavedSearch = useMail((s) => s.createSavedSearch)
  const deleteSavedSearch = useMail((s) => s.deleteSavedSearch)
  const spamCount = useMail((s) => s.spamCount)
  const importantCount = useMail((s) => s.importantCount)
  const outbox = useMail((s) => s.outbox)
  const bulkIds = useMail((s) => s.bulkIds)

  const layout = useLayout((s) => s.settings)
  const setLayout = useLayout((s) => s.set)
  const saveLayout = useLayout((s) => s.save)

  const [showNewFolder, setShowNewFolder] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [showNewLabel, setShowNewLabel] = useState(false)
  const [labelName, setLabelName] = useState('')

  if (!layout.showFolders) return null

  const visibleFolders = showHidden ? folders : folders.filter((f) => f.isVisible)

  return (
    <aside
      className="flex shrink-0 flex-col border-r border-line bg-surface"
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
              {accountSync[account.id]?.status === 'syncing' && (
                <IconRefresh className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin text-muted" />
              )}
              {accountSync[account.id]?.status === 'error' && (
                <button
                  type="button"
                  title={`Sync error: ${accountSync[account.id]?.error ?? 'unknown'} — open account settings`}
                  aria-label="Sync error — open account settings"
                  onClick={(e) => {
                    e.stopPropagation()
                    window.dispatchEvent(
                      new CustomEvent('clover:open-settings', { detail: { tab: 'accounts' } })
                    )
                  }}
                  className="ml-auto grid h-3.5 w-3.5 shrink-0 place-items-center"
                >
                  <span className="block h-2.5 w-2.5 rounded-full bg-rose-500" />
                </button>
              )}
              {accountSync[account.id]?.status === 'synced' && (
                <span
                  title={`Synced ${syncAgo(accountSync[account.id]?.at ?? 0)}`}
                  className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500/70"
                />
              )}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={onCompose}
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
            aria-label={showHidden ? 'Hide hidden folders' : 'Show hidden folders'}
            aria-pressed={showHidden}
            onClick={() => setShowHidden(!showHidden)}
            className={showHidden ? 'text-accent' : 'text-muted hover:text-accent'}
          >
            <IconEye className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="New folder"
            aria-label="New folder"
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

        <button
          type="button"
          onClick={() => void selectFolder(OUTBOX_FOLDER_ID)}
          className={
            'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ' +
            (activeFolderId === OUTBOX_FOLDER_ID
              ? 'bg-accent/12 font-medium text-accent'
              : 'text-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/10')
          }
        >
          <span className="flex min-w-0 items-center gap-2">
            <IconSend className="h-4 w-4" />
            <span className="truncate">Outbox</span>
          </span>
          {outbox.length > 0 && (
            <span
              className={
                'shrink-0 rounded-full px-1.5 text-[10px] ' +
                (outbox.some((o) => o.status === 'failed')
                  ? 'bg-rose-500/15 text-rose-500'
                  : activeFolderId === OUTBOX_FOLDER_ID
                    ? 'text-accent'
                    : 'text-muted')
              }
            >
              {outbox.length}
            </span>
          )}
        </button>

        <div className="mt-3 flex items-center justify-between px-1 pb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Labels</span>
          <button
            type="button"
            title="New label"
            aria-label="New label"
            onClick={() => setShowNewLabel((v) => !v)}
            className="text-muted hover:text-accent"
          >
            <IconPlus className="h-3.5 w-3.5" />
          </button>
        </div>
        {showNewLabel && (
          <div className="flex items-center gap-1 px-1 pb-1.5">
            <input
              autoFocus
              value={labelName}
              onChange={(e) => setLabelName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && labelName.trim()) {
                  void createLabel(labelName)
                  setLabelName('')
                  setShowNewLabel(false)
                }
              }}
              placeholder="Label name"
              className="flex-1 rounded-lg border border-line bg-canvas/60 px-2.5 py-1.5 text-[12px] text-ink outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => {
                void createLabel(labelName)
                setLabelName('')
                setShowNewLabel(false)
              }}
              className="rounded-lg bg-accent px-2.5 py-1.5 text-[12px] font-medium text-accent-ink"
            >
              Add
            </button>
          </div>
        )}
        {labels.map((label) => (
          <button
            key={label.id}
            type="button"
            onClick={() => void selectFolder(`label:${label.id}`)}
            onContextMenu={(e) => {
              e.preventDefault()
              ask('Delete label', `Delete label "${label.name}"?`, () => void deleteLabel(label.id))
            }}
            className={
              'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ' +
              (activeFolderId === `label:${label.id}`
                ? 'bg-accent/12 font-medium text-accent'
                : 'text-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/10')
            }
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: label.color }} />
              <span className="truncate">{label.name}</span>
            </span>
          </button>
        ))}

        <div className="mt-3 flex items-center justify-between px-1 pb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Saved searches
          </span>
          {query.trim() && (
            <button
              type="button"
              title="Save current search"
              aria-label="Save current search"
              onClick={() => void createSavedSearch(query, query)}
              className="text-muted hover:text-accent"
            >
              <IconPlus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {savedSearches.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setQuery(s.query)}
            onContextMenu={(e) => {
              e.preventDefault()
              ask('Delete saved search', `Delete "${s.name}"?`, () => void deleteSavedSearch(s.id))
            }}
            className={
              'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ' +
              (query === s.query
                ? 'bg-accent/12 font-medium text-accent'
                : 'text-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/10')
            }
          >
            <span className="flex min-w-0 items-center gap-2">
              <IconSearch className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{s.name}</span>
            </span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onAddAccount}
        className="flex items-center gap-2 border-t border-line px-3.5 py-2.5 text-[12px] text-muted hover:text-ink"
      >
        <IconPlus className="h-3.5 w-3.5" />
        Add account
      </button>
    </aside>
  )
}
