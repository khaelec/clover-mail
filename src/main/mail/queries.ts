import { asc, desc, eq } from 'drizzle-orm'
import { getDb } from '../db'
import { folders, messages } from '../db/schema'
import { toMessageSummary } from './mappers'
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

export function listMessages(folderId: string, limit = 150, offset = 0): MessageSummary[] {
  return getDb()
    .select()
    .from(messages)
    .where(eq(messages.folderId, folderId))
    .orderBy(desc(messages.dateUtc), desc(messages.uid))
    .limit(limit)
    .offset(offset)
    .all()
    .map(toMessageSummary)
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
