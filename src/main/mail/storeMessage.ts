import { randomUUID } from 'node:crypto'
import type { ParsedMail } from 'mailparser'
import { and, eq } from 'drizzle-orm'
import { getDb } from '../db'
import { attachments, folders, messageBodies, messages } from '../db/schema'
import { indexMessage } from './search'
import { applyAssessment } from './spam'
import { saveAttachment } from './storage'

function addressJson(value: ParsedMail['to']): string | null {
  if (!value) return null
  const list = Array.isArray(value) ? value : value.value
  if (!list || list.length === 0) return null
  return JSON.stringify(
    list.map((a: { name?: string; address?: string }) => ({
      name: a.name ?? null,
      address: a.address ?? null
    }))
  )
}

export function ensureInboxFolder(accountId: string): string {
  const db = getDb()
  const existing = db
    .select()
    .from(folders)
    .where(and(eq(folders.accountId, accountId), eq(folders.specialUse, 'inbox')))
    .get()
  if (existing) return existing.id
  const id = randomUUID()
  db.insert(folders)
    .values({
      id,
      accountId,
      remotePath: 'INBOX',
      name: 'Inbox',
      specialUse: 'inbox',
      sortOrder: 0,
      isSubscribed: true,
      isVisible: true
    })
    .run()
  return id
}

export function ensureFolder(accountId: string, name: string): string {
  const db = getDb()
  const existing = db
    .select()
    .from(folders)
    .where(and(eq(folders.accountId, accountId), eq(folders.name, name)))
    .get()
  if (existing) return existing.id
  const id = randomUUID()
  db.insert(folders)
    .values({
      id,
      accountId,
      remotePath: name,
      name,
      specialUse: null,
      sortOrder: 100,
      isSubscribed: true,
      isVisible: true
    })
    .run()
  return id
}

/** Store a parsed message (used by POP3 fetch and mbox import) and index it. */
export function storeParsedMessage(
  accountId: string,
  folderId: string,
  uid: number,
  parsed: ParsedMail,
  source: Buffer,
  options: { pop3Uidl?: string | null; unread?: boolean } = {}
): string {
  const db = getDb()
  const id = `${folderId}:${uid}`
  const from = parsed.from?.value?.[0]
  const textPlain = typeof parsed.text === 'string' ? parsed.text : null
  const htmlRaw = typeof parsed.html === 'string' ? parsed.html : null
  const snippet = (textPlain ?? '').replace(/\s+/g, ' ').trim().slice(0, 240) || null
  const threadId = parsed.inReplyTo ?? parsed.messageId ?? id

  db.insert(messages)
    .values({
      id,
      accountId,
      folderId,
      uid,
      messageId: parsed.messageId ?? null,
      inReplyTo: parsed.inReplyTo ?? null,
      refs: null,
      subject: parsed.subject ?? null,
      fromName: from?.name ?? null,
      fromEmail: from?.address ?? null,
      toJson: addressJson(parsed.to),
      ccJson: addressJson(parsed.cc),
      bccJson: addressJson(parsed.bcc),
      replyToJson: addressJson(parsed.replyTo),
      dateUtc: parsed.date ? parsed.date.getTime() : null,
      internalDate: Date.now(),
      size: source.length,
      isRead: !options.unread,
      hasAttachments: parsed.attachments.length > 0,
      snippet,
      threadId,
      pop3Uidl: options.pop3Uidl ?? null
    })
    .onConflictDoNothing()
    .run()

  db.insert(messageBodies)
    .values({ messageId: id, textPlain, htmlRaw, fetchedAt: Date.now() })
    .onConflictDoUpdate({
      target: messageBodies.messageId,
      set: { textPlain, htmlRaw, fetchedAt: Date.now() }
    })
    .run()

  db.delete(attachments).where(eq(attachments.messageId, id)).run()
  for (const att of parsed.attachments) {
    const attId = randomUUID()
    let contentPath: string | null = null
    if (att.content && Buffer.isBuffer(att.content)) {
      try {
        contentPath = saveAttachment(id, attId, att.filename ?? null, att.content)
      } catch {
        contentPath = null
      }
    }
    db.insert(attachments)
      .values({
        id: attId,
        messageId: id,
        filename: att.filename ?? null,
        mimeType: att.contentType ?? null,
        size: typeof att.size === 'number' ? att.size : null,
        contentId: att.cid ? att.cid.replace(/^<|>$/g, '') : null,
        isInline: att.contentDisposition === 'inline' || Boolean(att.cid),
        contentPath
      })
      .run()
  }

  indexMessage(id)
  applyAssessment(id)
  return id
}

export function nextUidForFolder(folderId: string): number {
  const rows = getDb()
    .select({ uid: messages.uid })
    .from(messages)
    .where(eq(messages.folderId, folderId))
    .all()
  return rows.reduce((max, row) => Math.max(max, row.uid), 0) + 1
}
