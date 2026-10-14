import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { folders } from '../db/schema'
import { withImap } from './connection'
import { inferSpecialUse } from './specialUse'
import type { DraftData } from '@shared/mail'

function buildRaw(draft: DraftData): string {
  const lines: string[] = []
  const from = draft.fromEmail
    ? draft.fromName
      ? `"${draft.fromName}" <${draft.fromEmail}>`
      : draft.fromEmail
    : ''
  lines.push(`From: ${from}`)
  lines.push(`To: ${(draft.to ?? []).join(', ')}`)
  if (draft.cc?.length) lines.push(`Cc: ${draft.cc.join(', ')}`)
  if (draft.bcc?.length) lines.push(`Bcc: ${draft.bcc.join(', ')}`)
  lines.push(`Subject: ${draft.subject ?? ''}`)
  lines.push(`Date: ${new Date().toUTCString()}`)
  lines.push('MIME-Version: 1.0')
  lines.push(draft.html ? 'Content-Type: text/html; charset=utf-8' : 'Content-Type: text/plain; charset=utf-8')
  lines.push('Content-Transfer-Encoding: 8bit')
  lines.push('')
  lines.push(draft.html ?? draft.text ?? '')
  return lines.join('\r\n')
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
  if (!folder) return null
  const raw = Buffer.from(buildRaw(draft), 'utf8')
  let uid: number | null = null
  await withImap(accountId, async (client) => {
    await client.mailboxOpen(folder.remotePath)
    if (existingUid) {
      await client.messageDelete(String(existingUid), { uid: true }).catch(() => undefined)
    }
    const result = (await client.append(folder.remotePath, raw, ['\\Draft'])) as
      | { uid?: number }
      | undefined
    uid = result?.uid ?? null
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
