import { and, eq, gte, inArray, like, lt, or, type SQL } from 'drizzle-orm'
import { getDb, getRawDb } from '@core/db'
import { folders, labels, messageBodies, messageLabels, messages } from '@core/db/schema'
import { protocolFor } from './accounts'
import { withImap } from './connection'
import { upsertMessage } from './sync'
import { toMessageSummary } from './mappers'
import type { MessageSummary } from '@shared/mail'
import { parseSearch, type ParsedSearch } from '@shared/search'

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

export { parseSearch, type ParsedSearch } from '@shared/search'

/**
 * SQL for every operator except free text. Null when the search can't match
 * anything (an unknown folder or label).
 */
function filterConditions(parsed: ParsedSearch): SQL[] | null {
  const conditions: SQL[] = []
  if (parsed.from)
    conditions.push(
      or(
        like(messages.fromEmail, `%${parsed.from}%`),
        like(messages.fromName, `%${parsed.from}%`)
      ) as SQL
    )
  if (parsed.to)
    conditions.push(
      or(like(messages.toJson, `%${parsed.to}%`), like(messages.ccJson, `%${parsed.to}%`)) as SQL
    )
  if (parsed.subject) conditions.push(like(messages.subject, `%${parsed.subject}%`))
  if (parsed.hasAttachment) conditions.push(eq(messages.hasAttachments, true))
  if (parsed.isUnread) conditions.push(eq(messages.isRead, false))
  if (parsed.isRead) conditions.push(eq(messages.isRead, true))
  if (parsed.isFlagged) conditions.push(eq(messages.isFlagged, true))
  if (parsed.isImportant) conditions.push(eq(messages.isImportant, true))
  if (parsed.before) conditions.push(lt(messages.dateUtc, parsed.before))
  if (parsed.after) conditions.push(gte(messages.dateUtc, parsed.after))

  const db = getDb()
  if (parsed.inFolder) {
    const matching = db
      .select()
      .from(folders)
      .where(like(folders.name, `%${parsed.inFolder}%`))
      .all()
    const folderIds = matching.map((f) => f.id)
    if (folderIds.length === 0) return null
    conditions.push(inArray(messages.folderId, folderIds))
  }
  if (parsed.label) {
    const needle = parsed.label.toLowerCase()
    const labelRow = db
      .select()
      .from(labels)
      .all()
      .find((l) => l.name.toLowerCase() === needle)
    if (!labelRow) return null
    const msgIds = db
      .select()
      .from(messageLabels)
      .where(eq(messageLabels.labelId, labelRow.id))
      .all()
      .map((r) => r.messageId)
    if (msgIds.length === 0) return null
    conditions.push(inArray(messages.id, msgIds))
  }

  return conditions
}

export function searchMessages(query: string, accountId?: string): MessageSummary[] {
  const parsed = parseSearch(query)
  const conditions: SQL[] = []
  if (accountId) conditions.push(eq(messages.accountId, accountId))

  if (parsed.text.trim()) {
    const fts = buildFtsQuery(parsed.text)
    const ids = fts
      ? (
          getRawDb()
            .prepare('SELECT message_id FROM messages_fts WHERE messages_fts MATCH ? LIMIT 2000')
            .all(fts) as { message_id: string }[]
        ).map((hit) => hit.message_id)
      : []
    if (ids.length === 0) return []
    conditions.push(inArray(messages.id, ids))
  }

  const filters = filterConditions(parsed)
  if (!filters) return []
  conditions.push(...filters)

  if (conditions.length === 0) return []
  return getDb()
    .select()
    .from(messages)
    .where(and(...conditions))
    .all()
    .sort((a, b) => (b.dateUtc ?? 0) - (a.dateUtc ?? 0))
    .map(toMessageSummary)
}

/**
 * Ask the IMAP server directly (searches the whole mailbox, not just cache).
 * Matches are upserted locally so they can be opened normally.
 */
export async function searchServer(accountId: string, query: string): Promise<MessageSummary[]> {
  if (protocolFor(accountId) !== 'imap') return []
  const parsed = parseSearch(query)
  // All parts must match (imapflow ANDs the keys of one criteria object). Free
  // text uses TEXT, which covers headers too, like the local search.
  const criteria: Record<string, unknown> = {}
  if (parsed.text) criteria.text = parsed.text
  if (parsed.subject) criteria.subject = parsed.subject
  if (parsed.from) criteria.from = parsed.from
  if (parsed.to) criteria.to = parsed.to
  // Only worth asking the server when there's something to look for.
  if (Object.keys(criteria).length === 0) return []
  if (parsed.isUnread) criteria.seen = false
  if (parsed.isRead) criteria.seen = true
  if (parsed.isFlagged) criteria.flagged = true
  if (parsed.after) criteria.since = new Date(parsed.after)
  if (parsed.before) criteria.before = new Date(parsed.before)
  const db = getDb()
  const needle = parsed.inFolder?.toLowerCase()
  const folderRows = db
    .select()
    .from(folders)
    .where(eq(folders.accountId, accountId))
    .all()
    .filter((f) => !needle || f.name.toLowerCase().includes(needle))
  const ids = new Set<string>()

  await withImap(accountId, async (client) => {
    for (const folder of folderRows) {
      if (ids.size >= 200) break
      try {
        await client.mailboxOpen(folder.remotePath, { readOnly: true })
        const uids = await client.search(criteria, { uid: true })
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
  // The server can't check everything (attachments, labels, exact dates), so
  // apply the same filters as the local search to what it found.
  const filters = filterConditions(parsed)
  if (!filters) return []
  return db
    .select()
    .from(messages)
    .where(and(inArray(messages.id, [...ids]), ...filters))
    .all()
    .sort((a, b) => (b.dateUtc ?? 0) - (a.dateUtc ?? 0))
    .map(toMessageSummary)
}
