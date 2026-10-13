import { simpleParser } from 'mailparser'
import { getDb } from '../db'
import { eq } from 'drizzle-orm'
import { folders } from '../db/schema'
import { getAccountById } from './accounts'
import { getAccountAuth } from './auth'
import { buildTransport } from './smtp'
import { withImap } from './connection'
import { storeParsedMessage } from './storeMessage'
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

interface InlineAttachment {
  filename: string
  cid: string
  content: Buffer
  contentType: string
}

/** Turn data: images embedded in the HTML (e.g. a picture signature) into inline CID parts. */
function extractInlineImages(html: string | undefined): {
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

export async function sendMessage(input: ComposeInput): Promise<void> {
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
    })) as { message?: Buffer }
    raw = info.message
  } finally {
    transport.close()
  }

  // Best-effort: file the sent copy in the account's Sent folder, and cache it
  // locally so it shows up in its conversation immediately (before the next sync).
  try {
    const sentFolder = getDb()
      .select()
      .from(folders)
      .where(eq(folders.accountId, input.accountId))
      .all()
      .find((f) => f.specialUse === 'sent')
    if (sentFolder && raw) {
      let serverUid: number | undefined
      await withImap(input.accountId, async (client) => {
        const result = await client.append(sentFolder.remotePath, raw as Buffer, ['\\Seen'])
        if (result && typeof result.uid === 'number') serverUid = result.uid
      })
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
  } catch {
    // Ignore: the message was sent; filing it is non-critical.
  }
}
