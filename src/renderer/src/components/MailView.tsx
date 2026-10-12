import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useMail } from '../state/mail'
import { JUNK_FOLDER_ID } from '@shared/mail'
import type { FolderSummary, MessageSummary } from '@shared/mail'
import { Reader } from './Reader'
import { Compose } from './Compose'
import { AccountSetup } from './AccountSetup'
import {
  IconCompose,
  IconInbox,
  IconPaperclip,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconStar,
  IconTrash,
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

  const selectAccount = useMail((s) => s.selectAccount)
  const selectFolder = useMail((s) => s.selectFolder)
  const selectMessage = useMail((s) => s.selectMessage)
  const sync = useMail((s) => s.sync)
  const search = useMail((s) => s.search)
  const clearSearch = useMail((s) => s.clearSearch)
  const toggleFlag = useMail((s) => s.toggleFlag)

  const [showAdd, setShowAdd] = useState(false)
  const [composeState, setComposeState] = useState<{ open: boolean; to?: string; subject?: string; body?: string }>({
    open: false
  })
  const [query, setQuery] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activeAccount = useMemo(
    () => accounts.find((a) => a.id === activeAccountId) ?? null,
    [accounts, activeAccountId]
  )
  const list = searchResults ?? messages

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

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-56 shrink-0 flex-col border-r border-line">
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

        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3">
          {folders.map((folder) => {
            const active = folder.id === activeFolderId
            return (
              <button
                key={folder.id}
                type="button"
                onClick={() => void selectFolder(folder.id)}
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

      <section className="flex w-[360px] shrink-0 flex-col border-r border-line">
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
            title="Sync now"
            onClick={() => void sync()}
            className="grid h-7 w-7 place-items-center rounded-md text-muted hover:text-accent"
          >
            <IconRefresh className={syncing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          </button>
        </div>
        {status && <div className="border-b border-line px-3.5 py-1 text-[11px] text-muted">{status}</div>}
        {error && <div className="border-b border-line px-3.5 py-1 text-[11px] text-rose-500">{error}</div>}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {list.length === 0 && (
            <div className="px-4 py-10 text-center text-[12px] text-muted">
              {searchQuery
                ? 'No results.'
                : activeFolderId
                  ? 'No cached messages. Hit sync to fetch.'
                  : 'Select a folder.'}
            </div>
          )}
          {list.map((m: MessageSummary) => {
            const active = m.id === selectedMessageId
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => void selectMessage(m.id)}
                className={
                  'block w-full border-b border-line/70 px-3.5 py-3 text-left transition-colors ' +
                  (active ? 'bg-accent/8' : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]')
                }
              >
                <div className="flex items-center gap-2">
                  {!m.isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                  <span className={'truncate text-[13px] ' + (m.isRead ? 'text-ink/85' : 'font-semibold text-ink')}>
                    {m.fromName || m.fromEmail || '(unknown sender)'}
                  </span>
                  {m.hasAttachments && <IconPaperclip className="h-3.5 w-3.5 shrink-0 text-muted" />}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      void toggleFlag(m)
                    }}
                    className="ml-auto shrink-0"
                  >
                    <IconStar className={'h-3.5 w-3.5 ' + (m.isFlagged ? 'text-amber-400' : 'text-muted/50 hover:text-amber-400')} />
                  </button>
                  <span className="shrink-0 text-[11px] text-muted">{formatListDate(m.dateUtc)}</span>
                </div>
                <div className={'mt-0.5 truncate text-[13px] ' + (m.isRead ? 'text-muted' : 'font-medium text-ink')}>
                  {m.subject || '(no subject)'}
                </div>
                {m.snippet && <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted">{m.snippet}</div>}
              </button>
            )
          })}
        </div>
      </section>

      <Reader onReply={openReply} />

      {composeState.open && activeAccountId && (
        <Compose
          accountId={activeAccountId}
          initialTo={composeState.to}
          initialSubject={composeState.subject}
          initialBody={composeState.body}
          onClose={() => setComposeState({ open: false })}
        />
      )}
      {showAdd && <AccountSetup onClose={() => setShowAdd(false)} />}
    </div>
  )
}
