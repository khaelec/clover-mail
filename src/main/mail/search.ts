import { and, desc, eq, inArray } from 'drizzle-orm'
import { getDb, getRawDb } from '../db'
import { folders, messageBodies, messages } from '../db/schema'
import { withImap } from './connection'
import { upsertMessage } from './sync'
import { toMessageSummary } from './mappers'
import type { MessageSummary } from '@shared/mail'

/** Upsert the search-index row for one message from its current DB state. */
export function indexMessage(messageId: string): void {
  const db = getDb()
  const row = db.select().from(messages).where(eq(messages.id, messageId)).get()
  if (!row) return
  const body = db
    .select()
    .from(messageBodies)
    .where(eq(messageBodies.messageId, messageId))
    .get()

  const raw = getRawDb()
  raw.prepare('DELETE FROM messages_fts WHERE message_id = ?').run(messageId)
  raw
    .prepare(
      `INSERT INTO messages_fts (message_id, subject, from_name, from_email, snippet, body)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      messageId,
      row.subject ?? '',
      row.fromName ?? '',
      row.fromEmail ?? '',
      row.snippet ?? '',
      body?.textPlain ?? ''
    )
}

export function removeFromIndex(messageId: string): void {
  getRawDb().prepare('DELETE FROM messages_fts WHERE message_id = ?').run(messageId)
}

function buildFtsQuery(input: string): string {
  const tokens = input
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.replace(/["]/g, '').replace(/[*()]/g, ''))
    .filter(Boolean)
  if (tokens.length === 0) return ''
  return tokens.map((token) => `"${token}"*`).join(' AND ')
}

export function searchMessages(query: string, accountId?: string): MessageSummary[] {
  const fts = buildFtsQuery(query)
  if (!fts) return []

  const hits = getRawDb()
    .prepare('SELECT message_id FROM messages_fts WHERE messages_fts MATCH ? LIMIT 200')
    .all(fts) as { message_id: string }[]

  const ids = hits.map((hit) => hit.message_id)
  if (ids.length === 0) return []

  const db = getDb()
  const rows = db
    .select()
    .from(messages)
    .where(
      accountId
        ? and(inArray(messages.id, ids), eq(messages.accountId, accountId))
        : inArray(messages.id, ids)
    )
    .all()

  return rows
    .sort((a, b) => (b.dateUtc ?? 0) - (a.dateUtc ?? 0))
    .map(toMessageSummary)
}

/**
 * Ask the IMAP server directly (searches the whole mailbox, not just cache).
 * Matches are upserted locally so they can be opened normally.
 */
export async function searchServer(accountId: string, query: string): Promise<MessageSummary[]> {
  const q = query.trim()
  if (!q) return []
  const db = getDb()
  const folderRows = db.select().from(folders).where(eq(folders.accountId, accountId)).all()
  const ids = new Set<string>()

  await withImap(accountId, async (client) => {
    for (const folder of folderRows) {
      if (ids.size >= 200) break
      try {
        await client.mailboxOpen(folder.remotePath, { readOnly: true })
        const uids = await client.search(
          { or: [{ subject: q }, { from: q }, { body: q }] },
          { uid: true }
        )
        if (!uids || uids.length === 0) continue
        const subset = uids.slice(-100)
        for await (const msg of client.fetch(
          subset,
          { uid: true, envelope: true, flags: true, internalDate: true, size: true, bodyStructure: true },
          { uid: true }
        )) {
          upsertMessage(accountId, folder.id, msg)
          ids.add(`${folder.id}:${msg.uid}`)
        }
      } catch {
        // skip folders the server refuses to search
      }
      await client.mailboxClose().catch(() => undefined)
    }
  })

  if (ids.size === 0) return []
  return db
    .select()
    .from(messages)
    .where(inArray(messages.id, [...ids]))
    .all()
    .sort((a, b) => (b.dateUtc ?? 0) - (a.dateUtc ?? 0))
    .map(toMessageSummary)
}
