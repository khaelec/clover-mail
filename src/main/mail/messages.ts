import { simpleParser } from 'mailparser'
import { randomUUID } from 'node:crypto'
import { copyFileSync } from 'node:fs'
import { dialog } from 'electron'
import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { attachments, folders, messageBodies, messages } from '../db/schema'
import { getAccountById, getAccountPassword } from './accounts'
import { buildImapClient } from './imap'
import { indexMessage, removeFromIndex } from './search'
import { applyAssessment } from './spam'
import { attachmentAbsolutePath, readAttachmentDataUrl, saveAttachment } from './storage'
import { toAttachmentSummary, toMessageSummary } from './mappers'
import type { InlineImage, MessageDetail } from '@shared/mail'

function parseAddresses(json: string | null): string[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json) as { name: string | null; address: string | null }[]
    return parsed
      .map((a) => (a.name ? `${a.name} <${a.address ?? ''}>` : a.address ?? ''))
      .filter(Boolean)
  } catch {
    return []
  }
}

function normalizeContentId(cid: string): string {
  return cid.replace(/^<|>$/g, '').trim()
}

function parseReasons(json: string | null): string[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? (parsed as string[]) : []
  } catch {
    return []
  }
}

function toDetail(
  row: typeof messages.$inferSelect,
  textPlain: string | null,
  htmlRaw: string | null,
  attachmentRows: (typeof attachments.$inferSelect)[],
  inlineImages: InlineImage[]
): MessageDetail {
  return {
    ...toMessageSummary(row),
    messageId: row.messageId,
    inReplyTo: row.inReplyTo,
    refs: row.refs,
    to: parseAddresses(row.toJson),
    cc: parseAddresses(row.ccJson),
    bcc: parseAddresses(row.bccJson),
    textPlain,
    htmlRaw,
    attachments: attachmentRows.map(toAttachmentSummary),
    inlineImages,
    spamReasons: parseReasons(row.spamReasons)
  }
}

async function fetchAndStoreBody(messageId: string): Promise<void> {
  const db = getDb()
  const row = db.select().from(messages).where(eq(messages.id, messageId)).get()
  if (!row) return
  const folderRow = db.select().from(folders).where(eq(folders.id, row.folderId)).get()
  if (!folderRow) return
  const account = getAccountById(row.accountId)
  if (!account) return
  const password = getAccountPassword(row.accountId)
  if (!password) return

  const client = buildImapClient(account.incoming, password)
  await client.connect()
  try {
    await client.mailboxOpen(folderRow.remotePath, { readOnly: true })
    const fetched = await client.fetchOne(String(row.uid), { source: true }, { uid: true })
    if (!fetched || !fetched.source) return

    const parsed = await simpleParser(fetched.source)
    const textPlain = typeof parsed.text === 'string' ? parsed.text : null
    const htmlRaw = typeof parsed.html === 'string' ? parsed.html : null
    const snippet = (textPlain ?? '').replace(/\s+/g, ' ').trim().slice(0, 240) || null
    const hasAttachments = parsed.attachments.length > 0

    db.insert(messageBodies)
      .values({ messageId, textPlain, htmlRaw, fetchedAt: Date.now() })
      .onConflictDoUpdate({
        target: messageBodies.messageId,
        set: { textPlain, htmlRaw, fetchedAt: Date.now() }
      })
      .run()

    db.delete(attachments).where(eq(attachments.messageId, messageId)).run()
    for (const att of parsed.attachments) {
      const id = randomUUID()
      let contentPath: string | null = null
      if (att.content && Buffer.isBuffer(att.content)) {
        try {
          contentPath = saveAttachment(messageId, id, att.filename ?? null, att.content)
        } catch {
          contentPath = null
        }
      }
      db.insert(attachments)
        .values({
          id,
          messageId,
          filename: att.filename ?? null,
          mimeType: att.contentType ?? null,
          size: typeof att.size === 'number' ? att.size : null,
          contentId: att.cid ? normalizeContentId(att.cid) : null,
          isInline: att.contentDisposition === 'inline' || Boolean(att.cid),
          contentPath
        })
        .run()
    }

    db.update(messages)
      .set({ snippet, hasAttachments, isRead: true })
      .where(eq(messages.id, messageId))
      .run()

    indexMessage(messageId)
    applyAssessment(messageId)
  } finally {
    await client.logout().catch(() => undefined)
  }
}

export async function getMessageDetail(messageId: string): Promise<MessageDetail | null> {
  const db = getDb()
  let row = db.select().from(messages).where(eq(messages.id, messageId)).get()
  if (!row) return null

  let body = db.select().from(messageBodies).where(eq(messageBodies.messageId, messageId)).get()
  if (!body) {
    await fetchAndStoreBody(messageId)
    row = db.select().from(messages).where(eq(messages.id, messageId)).get()
    if (!row) return null
    body = db.select().from(messageBodies).where(eq(messageBodies.messageId, messageId)).get()
  }

  const attachmentRows = db
    .select()
    .from(attachments)
    .where(eq(attachments.messageId, messageId))
    .all()

  const inlineImages: InlineImage[] = []
  for (const att of attachmentRows) {
    if (!att.isInline || !att.contentId || !att.contentPath) continue
    const dataUrl = readAttachmentDataUrl(att.contentPath, att.mimeType)
    if (dataUrl) inlineImages.push({ contentId: att.contentId, dataUrl })
  }

  return toDetail(row, body?.textPlain ?? null, body?.htmlRaw ?? null, attachmentRows, inlineImages)
}

export async function downloadAttachment(
  attachmentId: string
): Promise<{ saved: boolean; path?: string }> {
  const db = getDb()
  const row = db.select().from(attachments).where(eq(attachments.id, attachmentId)).get()
  if (!row || !row.contentPath) return { saved: false }

  const result = await dialog.showSaveDialog({
    defaultPath: row.filename ?? 'attachment'
  })
  if (result.canceled || !result.filePath) return { saved: false }

  copyFileSync(attachmentAbsolutePath(row.contentPath), result.filePath)
  return { saved: true, path: result.filePath }
}

async function withMailbox<T>(
  messageId: string,
  fn: (client: Awaited<ReturnType<typeof buildImapClient>>, uid: number, remotePath: string) => Promise<T>
): Promise<T | null> {
  const db = getDb()
  const row = db.select().from(messages).where(eq(messages.id, messageId)).get()
  if (!row) return null
  const folderRow = db.select().from(folders).where(eq(folders.id, row.folderId)).get()
  if (!folderRow) return null
  const account = getAccountById(row.accountId)
  if (!account) return null
  const password = getAccountPassword(row.accountId)
  if (!password) return null

  const client = buildImapClient(account.incoming, password)
  await client.connect()
  try {
    await client.mailboxOpen(folderRow.remotePath)
    return await fn(client, row.uid, folderRow.remotePath)
  } finally {
    await client.logout().catch(() => undefined)
  }
}

export async function setFlags(
  messageId: string,
  flags: { seen?: boolean; flagged?: boolean }
): Promise<void> {
  await withMailbox(messageId, async (client, uid) => {
    if (flags.seen !== undefined) {
      if (flags.seen) await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })
      else await client.messageFlagsRemove(String(uid), ['\\Seen'], { uid: true })
    }
    if (flags.flagged !== undefined) {
      if (flags.flagged) await client.messageFlagsAdd(String(uid), ['\\Flagged'], { uid: true })
      else await client.messageFlagsRemove(String(uid), ['\\Flagged'], { uid: true })
    }
  })

  const db = getDb()
  const set: { isRead?: boolean; isFlagged?: boolean } = {}
  if (flags.seen !== undefined) set.isRead = flags.seen
  if (flags.flagged !== undefined) set.isFlagged = flags.flagged
  if (Object.keys(set).length) {
    db.update(messages).set(set).where(eq(messages.id, messageId)).run()
  }
}

export async function moveMessage(messageId: string, targetFolderId: string): Promise<void> {
  const db = getDb()
  const target = db.select().from(folders).where(eq(folders.id, targetFolderId)).get()
  if (!target) return
  await withMailbox(messageId, async (client, uid) => {
    await client.messageMove(String(uid), target.remotePath, { uid: true })
  })
  db.delete(messages).where(eq(messages.id, messageId)).run()
  removeFromIndex(messageId)
}

export async function deleteMessage(messageId: string): Promise<void> {
  await withMailbox(messageId, async (client, uid) => {
    await client.messageDelete(String(uid), { uid: true })
  })
  const db = getDb()
  db.delete(messages).where(eq(messages.id, messageId)).run()
  removeFromIndex(messageId)
}
