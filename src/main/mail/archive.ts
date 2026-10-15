import { createWriteStream } from 'node:fs'
import { eq } from 'drizzle-orm'
import { platform } from '@core/platform'
import { getDb } from '@core/db'
import { folders, messageBodies, messages } from '@core/db/schema'
import { protocolFor } from './accounts'
import { withImap } from './connection'

function addressLine(json: string | null): string {
  if (!json) return ''
  try {
    const list = JSON.parse(json) as { name: string | null; address: string | null }[]
    return list
      .map((a) => (a.name ? `${a.name} <${a.address ?? ''}>` : a.address ?? ''))
      .filter(Boolean)
      .join(', ')
  } catch {
    return ''
  }
}

export async function exportFolderMbox(
  folderId: string
): Promise<{ saved: boolean; path?: string; count?: number }> {
  const db = getDb()
  const folder = db.select().from(folders).where(eq(folders.id, folderId)).get()
  if (!folder) return { saved: false }

  const rows = db
    .select({ id: messages.id, uid: messages.uid, internalDate: messages.internalDate })
    .from(messages)
    .where(eq(messages.folderId, folderId))
    .all()
  if (rows.length === 0) return { saved: false }

  const result = await platform().showSaveDialog(
    `${folder.name.replace(/[^\w.-]+/g, '_')}.mbox`
  )
  if (result.canceled || !result.filePath) return { saved: false }

  const out = createWriteStream(result.filePath)
  let count = 0

  if (protocolFor(folder.accountId) === 'imap') {
    await withImap(folder.accountId, async (client) => {
      await client.mailboxOpen(folder.remotePath, { readOnly: true })
      for (const row of rows) {
        const fetched = await client.fetchOne(String(row.uid), { source: true }, { uid: true })
        if (fetched && fetched.source) {
          const date = row.internalDate
            ? new Date(row.internalDate).toUTCString()
            : new Date().toUTCString()
          out.write(`From clover ${date}\r\n`)
          out.write(fetched.source)
          if (fetched.source[fetched.source.length - 1] !== 0x0a) out.write('\r\n')
          out.write('\r\n')
          count += 1
        }
      }
    })
  } else {
    // Local/POP3 mail has no server source — rebuild a minimal RFC822 message.
    for (const row of rows) {
      const message = db.select().from(messages).where(eq(messages.id, row.id)).get()
      if (!message) continue
      const body = db
        .select()
        .from(messageBodies)
        .where(eq(messageBodies.messageId, row.id))
        .get()
      const date = message.dateUtc ? new Date(message.dateUtc) : new Date()
      const from = message.fromName
        ? `${message.fromName} <${message.fromEmail ?? ''}>`
        : (message.fromEmail ?? 'unknown@localhost')
      const headers = [
        `From: ${from}`,
        `To: ${addressLine(message.toJson)}`,
        `Subject: ${message.subject ?? ''}`,
        `Date: ${date.toUTCString()}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8',
        ''
      ]
      out.write(`From clover ${date.toUTCString()}\r\n`)
      out.write(`${headers.join('\r\n')}\r\n${body?.textPlain ?? ''}\r\n\r\n`)
      count += 1
    }
  }

  await new Promise<void>((resolve) => out.end(() => resolve()))
  return { saved: true, path: result.filePath, count }
}
