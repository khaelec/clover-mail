import { and, asc, desc, eq, ne, sql } from 'drizzle-orm'
import { getDb } from '../db'
import { folders, messages } from '../db/schema'
import { toMessageSummary } from './mappers'
import { countSpam, listSpam } from './spam'
import type { FolderSummary, MessageSummary, ThreadSummary } from '@shared/mail'

export function listFolders(accountId: string): FolderSummary[] {
  return getDb()
    .select()
    .from(folders)
    .where(eq(folders.accountId, accountId))
    .all()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((row) => ({
      id: row.id,
      accountId: row.accountId,
      remotePath: row.remotePath,
      name: row.name,
      specialUse: row.specialUse,
      unreadCount: row.unreadCount,
      totalCount: row.totalCount,
      sortOrder: row.sortOrder
    }))
}

/** Regular folder listing — spam is routed to the synthetic Junk folder instead. */
export function listMessages(folderId: string, limit = 150, offset = 0): MessageSummary[] {
  return getDb()
    .select()
    .from(messages)
    .where(and(eq(messages.folderId, folderId), ne(messages.isSpam, true)))
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

/** Group a folder's messages into threads for conversation view. */
export function listThreads(folderId: string, limit = 400): ThreadSummary[] {
  const rows = getDb()
    .select()
    .from(messages)
    .where(and(eq(messages.folderId, folderId), ne(messages.isSpam, true)))
    .orderBy(desc(messages.dateUtc))
    .limit(limit)
    .all()

  const groups = new Map<string, typeof rows>()
  for (const row of rows) {
    const key = row.threadId ?? row.id
    const list = groups.get(key) ?? []
    list.push(row)
    groups.set(key, list)
  }

  const threads: ThreadSummary[] = []
  for (const [threadId, list] of groups) {
    const ordered = [...list].sort((a, b) => (a.dateUtc ?? 0) - (b.dateUtc ?? 0))
    const first = ordered[0]
    const last = ordered[ordered.length - 1]
    threads.push({
      threadId,
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

export function listImportant(accountId: string): MessageSummary[] {
  return getDb()
    .select()
    .from(messages)
    .where(and(eq(messages.accountId, accountId), eq(messages.isImportant, true)))
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
