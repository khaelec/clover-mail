import { and, eq, gt, inArray, like, lt, or, type SQL } from 'drizzle-orm'
import { getDb, getRawDb } from '../db'
import { folders, labels, messageBodies, messageLabels, messages } from '../db/schema'
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

export interface ParsedSearch {
  text: string
  from?: string
  to?: string
  subject?: string
  hasAttachment?: boolean
  isUnread?: boolean
  isRead?: boolean
  isFlagged?: boolean
  isImportant?: boolean
  inFolder?: string
  label?: string
  before?: number
  after?: number
}

function parseDate(value: string): number | undefined {
  const t = Date.parse(value)
  return Number.isNaN(t) ? undefined : t
}

/** Parse Gmail-style operators (from:, to:, subject:, has:attachment, is:unread, in:, label:, before:, after:) plus free text. */
export function parseSearch(input: string): ParsedSearch {
  const result: ParsedSearch = { text: '' }
  const tokens: string[] = []
  const re = /(\w+):("([^"]*)"|\S+)|"([^"]*)"|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(input)) !== null) {
    const key = m[1]?.toLowerCase()
    const val = (m[3] ?? m[2] ?? m[4] ?? m[5] ?? '').replace(/^"|"$/g, '')
    if (m[1] && val !== '') {
      switch (key) {
        case 'from':
          result.from = val
          break
        case 'to':
          result.to = val
          break
        case 'subject':
          result.subject = val
          break
        case 'body':
        case 'text':
          tokens.push(val)
          break
        case 'has':
          if (val === 'attachment' || val === 'attachments') result.hasAttachment = true
          break
        case 'is':
          if (val === 'unread') result.isUnread = true
          else if (val === 'read') result.isRead = true
          else if (val === 'flagged' || val === 'starred') result.isFlagged = true
          else if (val === 'important') result.isImportant = true
          break
        case 'in':
          result.inFolder = val
          break
        case 'label':
          result.label = val
          break
        case 'before':
          result.before = parseDate(val)
          break
        case 'after':
          result.after = parseDate(val)
          break
        default:
          tokens.push(m[0])
      }
    } else {
      const word = m[4] ?? m[5]
      if (word) tokens.push(word)
    }
  }
  result.text = tokens.join(' ')
  return result
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
            .prepare('SELECT message_id FROM messages_fts WHERE messages_fts MATCH ? LIMIT 300')
            .all(fts) as { message_id: string }[]
        ).map((hit) => hit.message_id)
      : []
    if (ids.length === 0) return []
    conditions.push(inArray(messages.id, ids))
  }

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
  if (parsed.after) conditions.push(gt(messages.dateUtc, parsed.after))

  const db = getDb()
  if (parsed.inFolder) {
    const matching = db
      .select()
      .from(folders)
      .where(like(folders.name, `%${parsed.inFolder}%`))
      .all()
    const folderIds = matching.map((f) => f.id)
    if (folderIds.length === 0) return []
    conditions.push(inArray(messages.folderId, folderIds))
  }
  if (parsed.label) {
    const needle = parsed.label.toLowerCase()
    const labelRow = db
      .select()
      .from(labels)
      .all()
      .find((l) => l.name.toLowerCase() === needle)
    if (!labelRow) return []
    const msgIds = db
      .select()
      .from(messageLabels)
      .where(eq(messageLabels.labelId, labelRow.id))
      .all()
      .map((r) => r.messageId)
    if (msgIds.length === 0) return []
    conditions.push(inArray(messages.id, msgIds))
  }

  if (conditions.length === 0) return []
  return db
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
  const parsed = parseSearch(query)
  const clauses: Record<string, string>[] = []
  if (parsed.text) clauses.push({ body: parsed.text })
  if (parsed.subject) clauses.push({ subject: parsed.subject })
  if (parsed.from) clauses.push({ from: parsed.from })
  if (parsed.to) clauses.push({ to: parsed.to })
  if (clauses.length === 0) return []
  const criteria = clauses.length === 1 ? clauses[0] : { or: clauses }
  const db = getDb()
  const folderRows = db.select().from(folders).where(eq(folders.accountId, accountId)).all()
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
  return db
    .select()
    .from(messages)
    .where(inArray(messages.id, [...ids]))
    .all()
    .sort((a, b) => (b.dateUtc ?? 0) - (a.dateUtc ?? 0))
    .map(toMessageSummary)
}
