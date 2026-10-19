import { eq } from 'drizzle-orm'
import { getDb } from '@core/db'
import { folders } from '@core/db/schema'
import { withImap } from './connection'
import { inferSpecialUse } from './specialUse'
import type { DraftData } from '@shared/mail'
import MailComposer from 'nodemailer/lib/mail-composer'
import type Mail from 'nodemailer/lib/mailer'
import { extractInlineImages } from './send'

/**
 * The draft as a MIME message. Built by nodemailer (like sending) so headers are
 * encoded, long lines are wrapped and pasted pictures become inline parts; a
 * hand-built message put megabytes of base64 on one line, which servers reject.
 */
export function buildDraftMessage(draft: DraftData): Promise<Buffer> {
  const from = draft.fromEmail
    ? draft.fromName
      ? { name: draft.fromName, address: draft.fromEmail }
      : draft.fromEmail
    : undefined
  const { html, inline } = extractInlineImages(draft.html)
  const composer = new MailComposer({
    from,
    to: draft.to?.length ? draft.to.join(', ') : undefined,
    cc: draft.cc?.length ? draft.cc.join(', ') : undefined,
    bcc: draft.bcc?.length ? draft.bcc.join(', ') : undefined,
    subject: draft.subject ?? '',
    date: new Date(),
    text: draft.text ?? undefined,
    html,
    attachments: inline.map((item) => ({
      filename: item.filename,
      content: item.content,
      contentType: item.contentType,
      cid: item.cid,
      contentDisposition: 'inline' as const
    }))
  } as Mail.Options)
  const node = composer.compile()
  // Drafts keep their Bcc (sending strips it).
  ;(node as unknown as { keepBcc: boolean }).keepBcc = true
  return new Promise((resolve, reject) => node.build((err, message) => (err ? reject(err) : resolve(message))))
}

function draftsFolder(accountId: string): typeof folders.$inferSelect | undefined {
  const list = getDb().select().from(folders).where(eq(folders.accountId, accountId)).all()
  return (
    list.find((f) => f.specialUse === 'drafts') ??
    list.find((f) => inferSpecialUse(f.remotePath, f.name) === 'drafts')
  )
}

/** Append (or replace) the draft in the account's Drafts folder. Returns the new UID. */
export async function saveDraft(
  accountId: string,
  draft: DraftData,
  existingUid?: number | null
): Promise<number | null> {
  const folder = draftsFolder(accountId)
  // Fail loudly: callers tell the user whether their draft was kept.
  if (!folder) throw new Error('This account has no Drafts folder yet')
  const raw = await buildDraftMessage(draft)
  let uid: number | null = null
  await withImap(accountId, async (client) => {
    // Save the new copy first and only then remove the old one, so a failed
    // save never leaves the user with no draft at all.
    const result = (await client.append(folder.remotePath, raw, ['\\Draft'])) as
      | { uid?: number }
      | undefined
    uid = result?.uid ?? null
    if (existingUid && existingUid !== uid) {
      await client.mailboxOpen(folder.remotePath)
      await client.messageDelete(String(existingUid), { uid: true }).catch(() => undefined)
    }
  })
  return uid
}

export async function deleteDraft(accountId: string, uid: number): Promise<void> {
  const folder = draftsFolder(accountId)
  if (!folder) return
  await withImap(accountId, async (client) => {
    await client.mailboxOpen(folder.remotePath)
    await client.messageDelete(String(uid), { uid: true }).catch(() => undefined)
  })
}
