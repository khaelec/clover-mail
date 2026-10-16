import { simpleParser } from 'mailparser'
import { randomUUID } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import type { ImapFlow } from 'imapflow'
import { platform } from '@core/platform'
import { desc, eq } from 'drizzle-orm'
import { getDb } from '@core/db'
import { attachments, folders, messageBodies, messages } from '@core/db/schema'
import { protocolFor } from './accounts'
import { withImap } from './connection'
import { indexMessage, removeFromIndex } from './search'
import { threadMessageIds } from './queries'
import { applyAssessment } from './spam'
import { markRecentlyRemoved } from '@core/mail/recentUids'
import { attachmentAbsolutePath, readAttachmentDataUrl, saveAttachment } from './storage'
import { assessPhishing, classifySecurity, trustedSenders } from './security'
import { inferSpecialUse } from './specialUse'
import { toAttachmentSummary, toMessageSummary } from './mappers'
import type { InlineImage, MessageDetail, MessagePhishing, MessageSecurity, MovedMessage } from '@shared/mail'

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
  inlineImages: InlineImage[],
  security: MessageSecurity,
  phishing: MessagePhishing
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
    spamReasons: parseReasons(row.spamReasons),
    security,
    phishing
  }
}

async function fetchAndStoreBody(messageId: string): Promise<void> {
  const db = getDb()
  const row = db.select().from(messages).where(eq(messages.id, messageId)).get()
  if (!row) return
  const folderRow = db.select().from(folders).where(eq(folders.id, row.folderId)).get()
  if (!folderRow) return

  await withImap(row.accountId, async (client) => {
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
      .set({ snippet, hasAttachments })
      .where(eq(messages.id, messageId))
      .run()

    indexMessage(messageId)
    applyAssessment(messageId)
  }, { retryOnDrop: true })
}

export async function getMessageDetail(messageId: string): Promise<MessageDetail | null> {
  return loadDetail(messageId, true)
}

/**
 * Build a message detail. `fetchBody` is false for background conversation
 * rendering so opening a thread never blocks on fetching every body over IMAP —
 * uncached bodies are loaded on demand instead.
 */
async function loadDetail(messageId: string, fetchBody: boolean): Promise<MessageDetail | null> {
  const db = getDb()
  let row = db.select().from(messages).where(eq(messages.id, messageId)).get()
  if (!row) return null

  let body = db.select().from(messageBodies).where(eq(messageBodies.messageId, messageId)).get()
  // A stored body with no text and no HTML means a previous fetch/parse produced
  // nothing — treat it as missing so it's retried instead of being stuck on
  // "Load message" forever. A failed fetch must not fail opening the message.
  const hasContent = Boolean(body && (body.textPlain || body.htmlRaw))
  if (!hasContent && fetchBody) {
    try {
      await fetchAndStoreBody(messageId)
    } catch {
      // Offline / server error — leave the body empty; the reader can retry.
    }
    row = db.select().from(messages).where(eq(messages.id, messageId)).get()
    if (!row) return null
    body = db.select().from(messageBodies).where(eq(messageBodies.messageId, messageId)).get()
  }

  let attachmentRows = db
    .select()
    .from(attachments)
    .where(eq(attachments.messageId, messageId))
    .all()

  // Older messages cached attachments under a path that contained the raw
  // `folderId:uid` message id, which Windows rejected (illegal ':'). Re-fetch
  // the source once so those attachment bytes are written to a valid path.
  if (
    fetchBody &&
    protocolFor(row.accountId) === 'imap' &&
    attachmentRows.length > 0 &&
    attachmentRows.every((att) => att.contentPath === null)
  ) {
    try {
      await fetchAndStoreBody(messageId)
      attachmentRows = db
        .select()
        .from(attachments)
        .where(eq(attachments.messageId, messageId))
        .all()
    } catch {
      // Offline or server error — leave attachments marked unavailable.
    }
  }

  const inlineImages: InlineImage[] = []
  for (const att of attachmentRows) {
    if (!att.isInline || !att.contentId || !att.contentPath) continue
    const dataUrl = readAttachmentDataUrl(att.contentPath, att.mimeType)
    if (dataUrl) inlineImages.push({ contentId: att.contentId, dataUrl })
  }

  const security = classifySecurity(
    body?.htmlRaw ?? null,
    body?.textPlain ?? null,
    attachmentRows.map((att) => att.mimeType ?? '')
  )
  // Never warn about your own mail: messages you sent (or drafted) are not
  // phishing, even if a signature link looks odd.
  const folderRow = db.select().from(folders).where(eq(folders.id, row.folderId)).get()
  const folderRole =
    folderRow?.specialUse ??
    (folderRow ? inferSpecialUse(folderRow.remotePath, folderRow.name) : null)
  const phishing: MessagePhishing =
    folderRole === 'sent' || folderRole === 'drafts'
      ? { suspicious: false, reasons: [] }
      : assessPhishing(
          row.fromEmail,
          row.fromName,
          row.replyToJson,
          body?.htmlRaw ?? null,
          body?.textPlain ?? null,
          trustedSenders()
        )

  return toDetail(
    row,
    body?.textPlain ?? null,
    body?.htmlRaw ?? null,
    attachmentRows,
    inlineImages,
    security,
    phishing
  )
}

/** All cached messages in the conversation that contains `messageId`, oldest first. */
export async function getConversation(messageId: string): Promise<MessageDetail[]> {
  const ids = threadMessageIds(messageId).slice(-30)
  const details: MessageDetail[] = []
  for (const id of ids) {
    const detail = await loadDetail(id, false)
    if (detail) details.push(detail)
  }
  return details
}

export async function downloadAttachment(
  attachmentId: string
): Promise<{ saved: boolean; path?: string }> {
  const db = getDb()
  const row = db.select().from(attachments).where(eq(attachments.id, attachmentId)).get()
  if (!row || !row.contentPath) return { saved: false }

  const result = await platform().showSaveDialog(row.filename ?? 'attachment')
  if (result.canceled || !result.filePath) return { saved: false }

  copyFileSync(attachmentAbsolutePath(row.contentPath), result.filePath)
  return { saved: true, path: result.filePath }
}

/** Absolute on-disk path of a cached attachment (used to re-attach on forward). */
export function getAttachmentPath(attachmentId: string): string | null {
  const row = getDb().select().from(attachments).where(eq(attachments.id, attachmentId)).get()
  if (!row || !row.contentPath) return null
  return attachmentAbsolutePath(row.contentPath)
}

/** Open an attachment with the OS default app (copied to a temp file with its real name). */
export async function openAttachment(
  attachmentId: string
): Promise<{ opened: boolean; error?: string }> {
  const row = getDb().select().from(attachments).where(eq(attachments.id, attachmentId)).get()
  if (!row || !row.contentPath) return { opened: false, error: 'Attachment is not cached yet' }
  try {
    const dir = join(tmpdir(), 'clover-attachments', attachmentId)
    mkdirSync(dir, { recursive: true })
    const safeName = basename(row.filename || `attachment-${attachmentId}`) || `attachment-${attachmentId}`
    let target = join(dir, safeName)
    const source = attachmentAbsolutePath(row.contentPath)
    try {
      copyFileSync(source, target)
    } catch {
      // The previous copy is still open in its viewer (Windows locks it) — use
      // a fresh name so re-opening an attachment always works.
      target = join(dir, `${Date.now()}-${safeName}`)
      copyFileSync(source, target)
    }
    const error = await platform().openPath(target)
    return { opened: !error, error: error || undefined }
  } catch (error) {
    return { opened: false, error: (error as Error).message }
  }
}

/** Read a text-ish attachment's content (capped) for in-app preview. */
export function readAttachmentText(attachmentId: string): string | null {
  const row = getDb().select().from(attachments).where(eq(attachments.id, attachmentId)).get()
  if (!row || !row.contentPath) return null
  try {
    const buffer = readFileSync(attachmentAbsolutePath(row.contentPath))
    return buffer.subarray(0, 200_000).toString('utf8')
  } catch {
    return null
  }
}

async function withMessageMailbox<T>(
  messageId: string,
  fn: (client: ImapFlow, uid: number, remotePath: string) => Promise<T>
): Promise<T | null> {
  const db = getDb()
  const row = db.select().from(messages).where(eq(messages.id, messageId)).get()
  if (!row) return null
  const folderRow = db.select().from(folders).where(eq(folders.id, row.folderId)).get()
  if (!folderRow) return null

  return withImap(row.accountId, async (client) => {
    await client.mailboxOpen(folderRow.remotePath)
    return fn(client, row.uid, folderRow.remotePath)
  })
}

export async function setFlags(
  messageId: string,
  flags: { seen?: boolean; flagged?: boolean; important?: boolean }
): Promise<void> {
  const db = getDb()
  const row = db.select().from(messages).where(eq(messages.id, messageId)).get()
  if (
    row &&
    protocolFor(row.accountId) === 'imap' &&
    (flags.seen !== undefined || flags.flagged !== undefined)
  ) {
    await withMessageMailbox(messageId, async (client, uid) => {
      if (flags.seen !== undefined) {
        if (flags.seen) await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })
        else await client.messageFlagsRemove(String(uid), ['\\Seen'], { uid: true })
      }
      if (flags.flagged !== undefined) {
        if (flags.flagged) await client.messageFlagsAdd(String(uid), ['\\Flagged'], { uid: true })
        else await client.messageFlagsRemove(String(uid), ['\\Flagged'], { uid: true })
      }
    })
  }

  const set: { isRead?: boolean; isFlagged?: boolean; isImportant?: boolean } = {}
  if (flags.seen !== undefined) set.isRead = flags.seen
  if (flags.flagged !== undefined) set.isFlagged = flags.flagged
  if (flags.important !== undefined) set.isImportant = flags.important
  if (Object.keys(set).length) {
    db.update(messages).set(set).where(eq(messages.id, messageId)).run()
  }
}

export async function moveMessage(
  messageId: string,
  targetFolderId: string
): Promise<MovedMessage | null> {
  const db = getDb()
  const target = db.select().from(folders).where(eq(folders.id, targetFolderId)).get()
  if (!target) return null

  const row = db.select().from(messages).where(eq(messages.id, messageId)).get()
  if (!row) return null

  if (protocolFor(row.accountId) !== 'imap') {
    db.update(messages).set({ folderId: targetFolderId }).where(eq(messages.id, messageId)).run()
    return {
      accountId: row.accountId,
      fromFolderId: row.folderId,
      toFolderId: targetFolderId,
      uid: row.uid,
      messageId: row.messageId
    }
  }

  // UIDPLUS gives us the message's new UID in the destination, which is what undo
  // needs — the old UID is meaningless once the message has moved.
  const response = await withMessageMailbox(messageId, (client, uid) =>
    client.messageMove(String(uid), target.remotePath, { uid: true })
  )
  const newUid = response && response.uidMap ? (response.uidMap.get(row.uid) ?? null) : null
  db.delete(messages).where(eq(messages.id, messageId)).run()
  removeFromIndex(messageId)
  return {
    accountId: row.accountId,
    fromFolderId: row.folderId,
    toFolderId: targetFolderId,
    uid: newUid,
    messageId: row.messageId
  }
}

export async function deleteMessage(messageId: string): Promise<void> {
  const db = getDb()
  const row = db.select().from(messages).where(eq(messages.id, messageId)).get()
  if (row && protocolFor(row.accountId) === 'imap') {
    await withMessageMailbox(messageId, async (client, uid) => {
      await client.messageDelete(String(uid), { uid: true })
    })
    // Don't let refill re-add it if the server still lists the UID briefly.
    markRecentlyRemoved(row.accountId, row.folderId, [row.uid])
  }
  db.delete(messages).where(eq(messages.id, messageId)).run()
  removeFromIndex(messageId)
}

/**
 * Find a message a notification points at. Its id is `${folderId}:${uid}`, so a
 * rule or move that ran after the notification gives it a new id; fall back to
 * the newest message in the same conversation (outside Trash/Junk).
 */
export function locateMessage(
  messageId: string,
  threadId?: string
): { id: string; accountId: string; folderId: string } | null {
  const db = getDb()
  const row = db.select().from(messages).where(eq(messages.id, messageId)).get()
  if (row) return { id: row.id, accountId: row.accountId, folderId: row.folderId }
  if (!threadId) return null
  const candidates = db
    .select({ id: messages.id, accountId: messages.accountId, folderId: messages.folderId, specialUse: folders.specialUse })
    .from(messages)
    .innerJoin(folders, eq(folders.id, messages.folderId))
    .where(eq(messages.threadId, threadId))
    .orderBy(desc(messages.dateUtc))
    .all()
  const best =
    candidates.find((c) => c.specialUse !== 'trash' && c.specialUse !== 'junk' && c.specialUse !== 'all') ??
    candidates[0]
  return best ? { id: best.id, accountId: best.accountId, folderId: best.folderId } : null
}
