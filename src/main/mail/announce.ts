import { and, eq, inArray } from 'drizzle-orm'
import { getDb } from '../db'
import { messages } from '../db/schema'
import { isThreadMuted } from './threadSettings'
import { isRecentlyRestored } from './recentUids'
import type { MailEvent } from '@shared/mail'

/**
 * Build a single `mail:new` for the messages *this sync* inserted into the Inbox,
 * or null if none qualify.
 *
 * Only messages actually fetched are considered (not "whatever is at the top of
 * the Inbox"), and read mail, spam, muted threads and messages Undo just restored
 * are skipped. A burst becomes one event ("and N more") pointing at the newest.
 */
export function announceNewInboxMessages(
  accountId: string,
  folderId: string,
  insertedUids: number[]
): MailEvent | null {
  if (insertedUids.length === 0) return null

  const db = getDb()
  const ids = insertedUids.map((uid) => `${folderId}:${uid}`)
  const rows = db
    .select()
    .from(messages)
    .where(and(eq(messages.accountId, accountId), inArray(messages.id, ids)))
    .all()

  const candidates = rows.filter(
    (row) =>
      !row.isRead &&
      !row.isSpam &&
      !isRecentlyRestored(accountId, folderId, row.uid) &&
      !isThreadMuted(row.threadId)
  )
  if (candidates.length === 0) return null

  candidates.sort((a, b) => (b.dateUtc ?? 0) - (a.dateUtc ?? 0))
  const newest = candidates[0]
  return {
    type: 'mail:new',
    accountId,
    messageId: newest.id,
    threadId: newest.threadId ?? undefined,
    title: newest.fromName || newest.fromEmail || 'New mail',
    body: candidates.length > 1 ? `and ${candidates.length - 1} more` : newest.subject ?? ''
  }
}
