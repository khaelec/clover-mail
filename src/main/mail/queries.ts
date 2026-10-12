import { and, asc, desc, eq, isNull, lt, ne, or, sql } from 'drizzle-orm'
import { getDb } from '../db'
import { folders, messages } from '../db/schema'
import { toMessageSummary } from './mappers'
import { countSpam, listSpam } from './spam'
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
  return getDb()
    .select()
    .from(messages)
    .where(and(eq(messages.folderId, folderId), ne(messages.isSpam, true), notSnoozed()))
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

function buildThreads(rows: (typeof messages.$inferSelect)[]): ThreadSummary[] {
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
      lastDate: last.dateUtc,
      messages: ordered.map(toMessageSummary)
    })
  }

  return threads.sort((a, b) => (b.lastDate ?? 0) - (a.lastDate ?? 0))
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
    .limit(limit)
    .all()
  return buildThreads(rows).filter((t) => t.messages.some((m) => m.folderId === folderId))
}

/** Threads across every account (Unified Inbox). */
export function listUnifiedThreads(limit = 300): ThreadSummary[] {
  const rows = getDb()
    .select()
    .from(messages)
    .where(and(ne(messages.isSpam, true), notSnoozed()))
    .orderBy(desc(messages.dateUtc))
    .limit(limit)
    .all()
  return buildThreads(rows)
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
