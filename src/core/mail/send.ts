import { randomUUID } from 'node:crypto'
import { simpleParser } from 'mailparser'
import { getDb } from '@core/db'
import { and, eq } from 'drizzle-orm'
import { folders } from '@core/db/schema'
import { getAccountById, protocolFor } from './accounts'
import { getAccountAuth } from './auth'
import { buildTransport } from './smtp'
import { withImap } from './connection'
import { storeParsedMessage } from './storeMessage'
import { recordRecipients } from './contacts'
import { inferSpecialUse, SPECIAL_USE_ORDER } from './specialUse'
import type { MailboxRecord } from './sync'
import type { ComposeInput } from '@shared/mail'

/**
 * UID to file a sent copy under when the server does not report one (no UIDPLUS).
 * Negative UIDs can never collide with real IMAP UIDs, and sync replaces the
 * placeholder once the server copy comes down.
 */
let syntheticUidCounter = 0
function nextSyntheticUid(): number {
  syntheticUidCounter += 1
  return -(Date.now() % 2_000_000_000) - syntheticUidCounter
}

type FolderRow = typeof folders.$inferSelect

function sentFolderFromList(list: FolderRow[]): FolderRow | undefined {
  return (
    list.find((f) => f.specialUse === 'sent') ??
    list.find((f) => inferSpecialUse(f.remotePath, f.name) === 'sent')
  )
}

/** Gmail already saves messages you send via its SMTP, so don't APPEND a second copy. */
function looksLikeGmail(list: FolderRow[]): boolean {
  return list.some((f) => /\[gmail\]/i.test(f.remotePath) || /^all mail$/i.test(f.name.trim()))
}

function insertSentFolder(accountId: string, remotePath: string): FolderRow | undefined {
  const db = getDb()
  const existing = db
    .select()
    .from(folders)
    .where(and(eq(folders.accountId, accountId), eq(folders.remotePath, remotePath)))
    .get()
  if (existing) return existing
  const id = randomUUID()
  db.insert(folders)
    .values({
      id,
      accountId,
      remotePath,
      name: 'Sent',
      specialUse: 'sent',
      sortOrder: SPECIAL_USE_ORDER.sent ?? 2,
      isSubscribed: true,
      isVisible: true
    })
    .run()
  return db.select().from(folders).where(eq(folders.id, id)).get()
}

/**
 * Find (or create) the folder sent copies belong in. Servers that don't report
 * IMAP SPECIAL-USE flags still get matched by name, and if none exists we make
 * one so every send leaves a record.
 */
async function resolveSentFolder(accountId: string): Promise<FolderRow | undefined> {
  const db = getDb()
  const list = db.select().from(folders).where(eq(folders.accountId, accountId)).all()
  const found = sentFolderFromList(list)
  if (found) {
    if (found.specialUse !== 'sent') {
      db.update(folders)
        .set({ specialUse: 'sent', sortOrder: SPECIAL_USE_ORDER.sent ?? 2 })
        .where(eq(folders.id, found.id))
        .run()
      return { ...found, specialUse: 'sent' }
    }
    return found
  }
  if (protocolFor(accountId) === 'imap') {
    try {
      let createdPath = 'Sent'
      await withImap(accountId, async (client) => {
        await client.mailboxCreate(createdPath)
        const refreshed = (await client.list()) as unknown as MailboxRecord[]
        const sent = refreshed.find((m) => inferSpecialUse(m.path, m.name) === 'sent')
        if (sent?.path) createdPath = sent.path
      })
      return insertSentFolder(accountId, createdPath)
    } catch {
      return undefined
    }
  }
  return insertSentFolder(accountId, 'Sent')
}

interface InlineAttachment {
  filename: string
  cid: string
  content: Buffer
  contentType: string
}

/** Turn data: images embedded in the HTML (pasted pictures, a picture signature) into inline CID parts. */
export function extractInlineImages(html: string | undefined): {
  html: string | undefined
  inline: InlineAttachment[]
} {
  if (!html) return { html, inline: [] }
  const inline: InlineAttachment[] = []
  let index = 0
  const out = html.replace(
    /src="data:(image\/[a-z0-9.+-]+);base64,([^"]+)"/gi,
    (_match, mime: string, base64: string) => {
      index += 1
      const ext = mime.split('/')[1] ?? 'png'
      const cid = `clover-inline-${index}-${Date.now()}@clover.mail`
      inline.push({
        filename: `image-${index}.${ext}`,
        cid,
        content: Buffer.from(base64, 'base64'),
        contentType: mime
      })
      return `src="cid:${cid}"`
    }
  )
  return { html: out, inline }
}

export async function deliverMessage(input: ComposeInput): Promise<void> {
  const account = getAccountById(input.accountId)
  if (!account) throw new Error('Account not found')
  const auth = await getAccountAuth(input.accountId)
  if (!auth) throw new Error('No credentials for account')

  const { html, inline } = extractInlineImages(input.html)
  const attachments = [
    ...(input.attachments?.map((a) => ({ filename: a.filename, path: a.path })) ?? []),
    ...inline.map((item) => ({
      filename: item.filename,
      content: item.content,
      contentType: item.contentType,
      cid: item.cid,
      contentDisposition: 'inline' as const
    }))
  ]

  const transport = buildTransport(account.outgoing, auth)
  const fromEmail = input.fromEmail || account.email
  const fromName = input.fromName ?? (input.fromEmail ? null : account.displayName)
  const from = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail
  let raw: Buffer | undefined
  try {
    const info = (await transport.sendMail({
      from,
      to: input.to.join(', '),
      cc: input.cc?.length ? input.cc.join(', ') : undefined,
      bcc: input.bcc?.length ? input.bcc.join(', ') : undefined,
      subject: input.subject,
      text: input.text,
      html,
      attachments: attachments.length ? attachments : undefined,
      inReplyTo: input.inReplyTo,
      references: input.references
    })) as { message?: Buffer; accepted?: string[]; rejected?: string[]; response?: string }
    // A server can accept the connection but reject every recipient — don't
    // report success when nothing was actually accepted for delivery.
    if (info.rejected && info.rejected.length > 0 && (!info.accepted || info.accepted.length === 0)) {
      throw new Error(`The mail server rejected the recipient(s): ${info.rejected.join(', ')}`)
    }
    raw = info.message
  } finally {
    transport.close()
  }

  // Suggest these recipients next time, before the Sent copy is even synced.
  recordRecipients([...input.to, ...(input.cc ?? []), ...(input.bcc ?? [])])

  // Best-effort: file the sent copy in the account's Sent folder, and cache it
  // locally so it shows up in its conversation immediately (before the next sync).
  try {
    if (raw) {
      const sentFolder = await resolveSentFolder(input.accountId)
      if (sentFolder) {
        const accountFolders = getDb()
          .select()
          .from(folders)
          .where(eq(folders.accountId, input.accountId))
          .all()
        let serverUid: number | undefined
        if (protocolFor(input.accountId) === 'imap' && !looksLikeGmail(accountFolders)) {
          try {
            await withImap(input.accountId, async (client) => {
              const result = await client.append(sentFolder.remotePath, raw as Buffer, ['\\Seen'])
              if (result && typeof result.uid === 'number') serverUid = result.uid
            })
          } catch {
            // Keep the local record even if filing to the server failed.
          }
        }
        const parsed = await simpleParser(raw)
        storeParsedMessage(
          input.accountId,
          sentFolder.id,
          typeof serverUid === 'number' ? serverUid : nextSyntheticUid(),
          parsed,
          raw,
          { assessSpam: false }
        )
      }
    }
  } catch {
    // Ignore: the message was sent; filing it is non-critical.
  }
}
