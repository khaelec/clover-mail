import { createWriteStream } from 'node:fs'
import { eq } from 'drizzle-orm'
import { dialog } from 'electron'
import { getDb } from '../db'
import { folders, messages } from '../db/schema'
import { withImap } from './connection'

export async function exportFolderMbox(
  folderId: string
): Promise<{ saved: boolean; path?: string; count?: number }> {
  const db = getDb()
  const folder = db.select().from(folders).where(eq(folders.id, folderId)).get()
  if (!folder) return { saved: false }

  const rows = db
    .select({ uid: messages.uid, internalDate: messages.internalDate })
    .from(messages)
    .where(eq(messages.folderId, folderId))
    .all()
  if (rows.length === 0) return { saved: false }

  const result = await dialog.showSaveDialog({
    title: 'Export folder to mbox',
    defaultPath: `${folder.name.replace(/[^\w.-]+/g, '_')}.mbox`
  })
  if (result.canceled || !result.filePath) return { saved: false }

  const out = createWriteStream(result.filePath)
  let count = 0

  await withImap(folder.accountId, async (client) => {
    await client.mailboxOpen(folder.remotePath, { readOnly: true })
    for (const row of rows) {
      const fetched = await client.fetchOne(String(row.uid), { source: true }, { uid: true })
      if (fetched && fetched.source) {
        const date = row.internalDate ? new Date(row.internalDate).toUTCString() : new Date().toUTCString()
        out.write(`From clover ${date}\r\n`)
        out.write(fetched.source)
        if (fetched.source[fetched.source.length - 1] !== 0x0a) out.write('\r\n')
        out.write('\r\n')
        count += 1
      }
    }
  })

  await new Promise<void>((resolve) => out.end(() => resolve()))
  return { saved: true, path: result.filePath, count }
}
