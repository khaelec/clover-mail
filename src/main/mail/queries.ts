import { and, asc, desc, eq, ne } from 'drizzle-orm'
import { getDb } from '../db'
import { folders, messages } from '../db/schema'
import { toMessageSummary } from './mappers'
import { countSpam, listSpam } from './spam'
import type { FolderSummary, MessageSummary } from '@shared/mail'

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
