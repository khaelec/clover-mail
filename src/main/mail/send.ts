import { getDb } from '../db'
import { eq } from 'drizzle-orm'
import { folders } from '../db/schema'
import { getAccountById, getAccountPassword } from './accounts'
import { buildTransport } from './smtp'
import { buildImapClient } from './imap'
import type { ComposeInput } from '@shared/mail'

export async function sendMessage(input: ComposeInput): Promise<void> {
  const account = getAccountById(input.accountId)
  if (!account) throw new Error('Account not found')
  const password = getAccountPassword(input.accountId)
  if (!password) throw new Error('No stored password for account')

  const transport = buildTransport(account.outgoing, password)
  let raw: Buffer | undefined
  try {
    const info = (await transport.sendMail({
      from: account.displayName ? `"${account.displayName}" <${account.email}>` : account.email,
      to: input.to.join(', '),
      cc: input.cc?.length ? input.cc.join(', ') : undefined,
      bcc: input.bcc?.length ? input.bcc.join(', ') : undefined,
      subject: input.subject,
      text: input.text,
      html: input.html,
      inReplyTo: input.inReplyTo,
      references: input.references
    })) as { message?: Buffer }
    raw = info.message
  } finally {
    transport.close()
  }

  // Best-effort: file the sent copy in the account's Sent folder.
  try {
    const sentFolder = getDb()
      .select()
      .from(folders)
      .where(eq(folders.accountId, input.accountId))
      .all()
      .find((f) => f.specialUse === 'sent')
    if (sentFolder && raw) {
      const client = buildImapClient(account.incoming, password)
      await client.connect()
      try {
        await client.append(sentFolder.remotePath, raw, ['\\Seen'])
      } finally {
        await client.logout().catch(() => undefined)
      }
    }
  } catch {
    // Ignore: the message was sent; filing it is non-critical.
  }
}
