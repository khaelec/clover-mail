import { and, asc, desc, eq, isNull, lt, ne, or, sql } from 'drizzle-orm'
import { getDb } from '@core/db'
import { accounts, folders, messages } from '@core/db/schema'
import { toMessageSummary } from './mappers'
import { countSpam, listSpam } from './spam'
import { listThreadFlags } from './threadSettings'
import { inferSpecialUse } from './specialUse'
import type { FolderSummary, MessageSummary, ThreadSummary } from '@shared/mail'

/** Excludes messages snoozed into the future. */
function notSnoozed(): ReturnType<typeof or> {
  return or(isNull(messages.snoozedUntil), lt(messages.snoozedUntil, Date.now()))
}

export function listFolders(accountId: string): FolderSummary[] {
  const db = getDb()
  const rows = db.select().from(folders).where(eq(folders.accountId, accountId)).all()

  // Unread is derived from cached messages so badges update the instant you read.
  const unread = db
    .select({ folderId: messages.folderId, count: sql<number>`count(*)` })
    .from(messages)
    .where(
      and(eq(messages.accountId, accountId), eq(messages.isRead, false), ne(messages.isSpam, true))
    )
    .groupBy(messages.folderId)
    .all()
  const unreadMap = new Map(unread.map((u) => [u.folderId, Number(u.count)]))

  return rows
    .filter((row) => row.remotePath !== '[Gmail]' && row.name !== '[Gmail]')
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((row) => ({
      id: row.id,
      accountId: row.accountId,
      remotePath: row.remotePath,
      name: row.name,
      specialUse: row.specialUse,
      unreadCount: unreadMap.get(row.id) ?? 0,
      totalCount: row.totalCount,
      sortOrder: row.sortOrder,
      isVisible: row.isVisible
    }))
}

/** Regular folder listing — spam is routed to the synthetic Junk folder instead. */
export function listMessages(folderId: string, limit = 150, offset = 0): MessageSummary[] {
  const db = getDb()
  const folderRow = db.select().from(folders).where(eq(folders.id, folderId)).get()
  const role =
    folderRow?.specialUse ??
    (folderRow ? inferSpecialUse(folderRow.remotePath, folderRow.name) : null)
  const conditions = [eq(messages.folderId, folderId), ne(messages.isSpam, true), notSnoozed()]
  // A Drafts folder should only ever list drafts.
  if (role === 'drafts') conditions.push(eq(messages.isDraft, true))
  return db
    .select()
    .from(messages)
    .where(and(...conditions))
    .orderBy(desc(messages.dateUtc), desc(messages.uid))
    .limit(limit)
    .offset(offset)
    .all()
    .map(toMessageSummary)
}

export function listJunk(accountId: string): MessageSummary[] {
  return listSpam(accountId).map(toMessageSummary)
}

export function spamCount(accountId: string): number {
  return countSpam(accountId)
}

/** Strip Re:/Fwd: prefixes so a conversation groups regardless of reply markers. */
function normalizeSubject(subject: string | null): string {
  if (!subject) return ''
  return subject
    .replace(/^\s*(?:(?:re|fwd|fw|aw|sv|vs)\s*(?:\[\d+\])?\s*:\s*)+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

type MessageRow = typeof messages.$inferSelect
type FolderRow = typeof folders.$inferSelect

// Gmail stores one message in several folders (INBOX + All Mail + Important, …)
// as separate rows sharing a Message-ID. Fetch extra rows so de-duplication
// still leaves roughly `limit` real messages.
const COPY_HEADROOM = 4

function isTrashOrJunk(folder: FolderRow | undefined): boolean {
  if (!folder) return false
  const role = folder.specialUse ?? inferSpecialUse(folder.remotePath, folder.name)
  return role === 'trash' || role === 'junk'
}

/** Lower wins. The copy in the folder being viewed always wins. */
function copyRank(folder: FolderRow | undefined, viewed: string | null): number {
  if (folder && folder.id === viewed) return 0
  if (isTrashOrJunk(folder)) return 100
  const role = folder
    ? (folder.specialUse ?? inferSpecialUse(folder.remotePath, folder.name))
    : null
  if (role === 'inbox') return 1
  if (role === 'sent') return 2
  if (role === 'drafts') return 3
  if ((folder?.name ?? '').toLowerCase() === 'important') return 5
  if (role === 'archive') return 6
  return 4
}

/**
 * Keep a single row per Message-ID (rows without one are left alone). Preferring
 * the viewed folder's copy means archive/delete/read act on the copy the user is
 * looking at; Trash/Junk copies are dropped unless that folder is the one being
 * viewed, so deleted mail stops showing up inside Inbox conversations.
 */
function dedupeCopies(
  rows: MessageRow[],
  foldersById: Map<string, FolderRow>,
  viewed: string | null
): MessageRow[] {
  const best = new Map<string, MessageRow>()
  for (const row of rows) {
    if (!row.messageId) continue
    const current = best.get(row.messageId)
    if (
      !current ||
      copyRank(foldersById.get(row.folderId), viewed) <
        copyRank(foldersById.get(current.folderId), viewed)
    ) {
      best.set(row.messageId, row)
    }
  }
  return rows.filter((row) => {
    if (!row.messageId) return true
    if (row.folderId !== viewed && isTrashOrJunk(foldersById.get(row.folderId))) return false
    return best.get(row.messageId) === row
  })
}

function foldersById(accountId?: string): Map<string, FolderRow> {
  const db = getDb()
  const rows = accountId
    ? db.select().from(folders).where(eq(folders.accountId, accountId)).all()
    : db.select().from(folders).all()
  return new Map(rows.map((f) => [f.id, f]))
}

function buildThreads(
  input: MessageRow[],
  foldersMap: Map<string, FolderRow>,
  viewed: string | null
): ThreadSummary[] {
  const rows = dedupeCopies(input, foldersMap, viewed)
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let root = parent.get(x) ?? x
    if (root !== x) {
      root = find(root)
      parent.set(x, root)
    }
    return root
  }
  const union = (a: string, b: string): void => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }

  for (const row of rows) parent.set(row.id, row.id)

  // Link by the References/In-Reply-To chain (threadId), then by normalized subject.
  const byThread = new Map<string, string>()
  for (const row of rows) {
    const key = row.threadId ?? row.id
    const first = byThread.get(key)
    if (first) union(row.id, first)
    else byThread.set(key, row.id)
  }
  const bySubject = new Map<string, string>()
  for (const row of rows) {
    const key = normalizeSubject(row.subject)
    if (!key) continue
    const first = bySubject.get(key)
    if (first) union(row.id, first)
    else bySubject.set(key, row.id)
  }

  const groups = new Map<string, (typeof rows)>()
  for (const row of rows) {
    const root = find(row.id)
    const list = groups.get(root) ?? []
    list.push(row)
    groups.set(root, list)
  }

  const threads: ThreadSummary[] = []
  for (const [root, list] of groups) {
    const ordered = [...list].sort((a, b) => (a.dateUtc ?? 0) - (b.dateUtc ?? 0))
    const first = ordered[0]
    const last = ordered[ordered.length - 1]
    threads.push({
      threadId: root,
      subject: first.subject,
      fromName: last.fromName,
      fromEmail: last.fromEmail,
      messageCount: ordered.length,
      unreadCount: ordered.filter((m) => !m.isRead).length,
      hasAttachments: ordered.some((m) => m.hasAttachments),
      isImportant: ordered.some((m) => m.isImportant),
      muted: false,
      pinned: false,
      lastDate: last.dateUtc,
      messages: ordered.map(toMessageSummary)
    })
  }

  const flags = listThreadFlags()
  for (const thread of threads) {
    const flag = flags.get(thread.threadId)
    thread.muted = flag?.muted ?? false
    thread.pinned = flag?.pinned ?? false
  }

  return threads.sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || (b.lastDate ?? 0) - (a.lastDate ?? 0)
  )
}

/**
 * Conversation view for a folder. Threads span the whole account (so a reply
 * filed in another folder/label still shows), but a thread is only listed when
 * at least one of its messages is in the requested folder.
 */
export function listThreads(folderId: string, limit = 1500): ThreadSummary[] {
  const db = getDb()
  const folderRow = db.select().from(folders).where(eq(folders.id, folderId)).get()
  if (!folderRow) return []
  const rows = db
    .select()
    .from(messages)
    .where(and(eq(messages.accountId, folderRow.accountId), ne(messages.isSpam, true), notSnoozed()))
    .orderBy(desc(messages.dateUtc))
    .limit(limit * COPY_HEADROOM)
    .all()
  return buildThreads(rows, foldersById(folderRow.accountId), folderId).filter((t) =>
    t.messages.some((m) => m.folderId === folderId)
  )
}

/**
 * For each id, whether the message still exists locally and whether it's read.
 * Lets the bell drop notifications for mail deleted on the server and clear the
 * ones that are now read (e.g. read on another device).
 */
export function messageStatuses(
  ids: string[]
): Record<string, { exists: boolean; isRead: boolean }> {
  const db = getDb()
  const out: Record<string, { exists: boolean; isRead: boolean }> = {}
  for (const id of ids) {
    const row = db.select({ isRead: messages.isRead }).from(messages).where(eq(messages.id, id)).get()
    out[id] = { exists: Boolean(row), isRead: row?.isRead ?? false }
  }
  return out
}

/** Whether the folder has any messages older than the current list window. */
export function hasOlderMessages(folderId: string, limit: number): boolean {
  const db = getDb()
  const folderRow = db.select().from(folders).where(eq(folders.id, folderId)).get()
  if (!folderRow) return false
  const rows = db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.accountId, folderRow.accountId), ne(messages.isSpam, true), notSnoozed()))
    .orderBy(desc(messages.dateUtc))
    .limit(limit + 1)
    .all()
  return rows.length > limit
}

/**
 * Message ids of the conversation that contains `messageId`, oldest first,
 * using the exact same grouping as the message list so the reader always shows
 * the same thread the list row represents.
 */
function findThreadRows(messageId: string, limit: number): MessageRow[] {
  const db = getDb()
  const row = db.select().from(messages).where(eq(messages.id, messageId)).get()
  if (!row) return []
  const rows = db
    .select()
    .from(messages)
    .where(and(eq(messages.accountId, row.accountId), ne(messages.isSpam, true), notSnoozed()))
    .orderBy(desc(messages.dateUtc))
    .limit(limit * COPY_HEADROOM)
    .all()
  const thread = buildThreads(rows, foldersById(row.accountId), row.folderId).find((t) =>
    t.messages.some((m) => m.id === messageId)
  )
  if (!thread) return [row]
  // buildThreads already ordered the thread oldest-first; recover full rows.
  const byId = new Map(rows.map((r) => [r.id, r]))
  return thread.messages
    .map((m) => byId.get(m.id))
    .filter((r): r is MessageRow => Boolean(r))
}

export function threadMessageIds(messageId: string, limit = 1500): string[] {
  return findThreadRows(messageId, limit).map((r) => r.id)
}

function parseAddressList(json: string | null): { name: string | null; address: string | null }[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Everyone who took part in the conversation containing `messageId` — From/To/Cc
 * across every message, de-duplicated, oldest first, excluding the account's own
 * address. Reply-all uses this so a thread with several people is fully covered
 * even when the open message only lists one of them.
 */
export function threadParticipants(messageId: string, limit = 1500): string[] {
  const rows = findThreadRows(messageId, limit)
  if (rows.length === 0) return []
  const account = getDb()
    .select({ email: accounts.email })
    .from(accounts)
    .where(eq(accounts.id, rows[0].accountId))
    .get()
  const self = (account?.email ?? '').trim().toLowerCase()

  const seen = new Set<string>()
  const out: string[] = []
  const add = (name: string | null, address: string | null): void => {
    const addr = (address ?? '').trim()
    if (!addr) return
    const key = addr.toLowerCase()
    if (key === self || seen.has(key)) return
    seen.add(key)
    out.push(name ? `${name} <${addr}>` : addr)
  }
  for (const row of rows) {
    add(row.fromName, row.fromEmail)
    for (const a of parseAddressList(row.toJson)) add(a.name, a.address)
    for (const a of parseAddressList(row.ccJson)) add(a.name, a.address)
  }
  return out
}

/** Threads across every account (Unified Inbox). */
export function listUnifiedThreads(limit = 300): ThreadSummary[] {
  const rows = getDb()
    .select()
    .from(messages)
    .where(and(ne(messages.isSpam, true), notSnoozed()))
    .orderBy(desc(messages.dateUtc))
    .limit(limit * COPY_HEADROOM)
    .all()
  return buildThreads(rows, foldersById(), null)
}

export function listUnifiedMessages(limit = 300): MessageSummary[] {
  return getDb()
    .select()
    .from(messages)
    .where(and(ne(messages.isSpam, true), notSnoozed()))
    .orderBy(desc(messages.dateUtc))
    .limit(limit)
    .all()
    .map(toMessageSummary)
}

export function listImportant(accountId: string): MessageSummary[] {
  return getDb()
    .select()
    .from(messages)
    .where(and(eq(messages.accountId, accountId), eq(messages.isImportant, true), notSnoozed()))
    .orderBy(desc(messages.dateUtc))
    .all()
    .map(toMessageSummary)
}

export function importantCount(accountId: string): number {
  const row = getDb()
    .select({ count: sql<number>`count(*)` })
    .from(messages)
    .where(and(eq(messages.accountId, accountId), eq(messages.isImportant, true)))
    .get()
  return Number(row?.count ?? 0)
}

export function folderById(folderId: string): typeof folders.$inferSelect | undefined {
  return getDb().select().from(folders).where(eq(folders.id, folderId)).get()
}

export function allFoldersSorted(accountId: string): (typeof folders.$inferSelect)[] {
  return getDb()
    .select()
    .from(folders)
    .where(eq(folders.accountId, accountId))
    .orderBy(asc(folders.sortOrder))
    .all()
}
