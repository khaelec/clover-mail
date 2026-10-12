import { and, eq } from 'drizzle-orm'
import { getDb } from '../db'
import { folders, messages } from '../db/schema'
import { moveMessage, setFlags } from './messages'
import { withImap } from './connection'
import { removeFromIndex } from './search'
import type { BulkActionInput, BulkActionResult } from '@shared/mail'

function specialFolderId(accountId: string, use: string): string | undefined {
  return getDb()
    .select()
    .from(folders)
    .where(and(eq(folders.accountId, accountId), eq(folders.specialUse, use)))
    .get()?.id
}

export async function bulkAction(input: BulkActionInput): Promise<BulkActionResult> {
  const result: BulkActionResult = { moved: 0, updated: 0, failed: 0 }
  const db = getDb()

  for (const id of input.messageIds) {
    try {
      const row = db.select().from(messages).where(eq(messages.id, id)).get()
      if (!row) {
        result.failed += 1
        continue
      }

      if (input.action === 'archive') {
        // Gmail-style archive: move out of Inbox to Archive / All Mail.
        const target =
          specialFolderId(row.accountId, 'archive') ?? specialFolderId(row.accountId, 'all')
        if (!target) {
          result.failed += 1
          continue
        }
        await moveMessage(id, target)
        result.moved += 1
      } else if (input.action === 'trash') {
        const target = specialFolderId(row.accountId, 'trash')
        if (!target) {
          result.failed += 1
          continue
        }
        await moveMessage(id, target)
        result.moved += 1
      } else if (input.action === 'markRead') {
        await setFlags(id, { seen: true })
        result.updated += 1
      } else if (input.action === 'markUnread') {
        await setFlags(id, { seen: false })
        result.updated += 1
      } else if (input.action === 'markImportant') {
        await setFlags(id, { important: true })
        result.updated += 1
      } else if (input.action === 'markNotImportant') {
        await setFlags(id, { important: false })
        result.updated += 1
      } else if (input.action === 'move' && input.targetFolderId) {
        await moveMessage(id, input.targetFolderId)
        result.moved += 1
      }
    } catch {
      result.failed += 1
    }
  }

  return result
}

/** Permanently delete every message in a folder (e.g. Empty Trash). */
export async function emptyFolder(folderId: string): Promise<{ deleted: number }> {
  const db = getDb()
  const folder = db.select().from(folders).where(eq(folders.id, folderId)).get()
  if (!folder) return { deleted: 0 }

  const rows = db
    .select({ id: messages.id, uid: messages.uid })
    .from(messages)
    .where(eq(messages.folderId, folderId))
    .all()
  if (rows.length === 0) return { deleted: 0 }

  await withImap(folder.accountId, async (client) => {
    await client.mailboxOpen(folder.remotePath)
    await client.messageDelete(
      rows.map((r) => r.uid),
      { uid: true }
    )
  })

  for (const row of rows) removeFromIndex(row.id)
  db.delete(messages).where(eq(messages.folderId, folderId)).run()
  return { deleted: rows.length }
}

/** Mark every message in a folder as read. */
export async function markFolderRead(folderId: string): Promise<number> {
  const db = getDb()
  const folder = db.select().from(folders).where(eq(folders.id, folderId)).get()
  if (!folder) return 0

  const rows = db
    .select({ uid: messages.uid })
    .from(messages)
    .where(eq(messages.folderId, folderId))
    .all()
  if (rows.length === 0) return 0

  await withImap(folder.accountId, async (client) => {
    await client.mailboxOpen(folder.remotePath)
    await client.messageFlagsAdd(
      rows.map((r) => r.uid),
      ['\\Seen'],
      { uid: true }
    )
  })
  db.update(messages).set({ isRead: true }).where(eq(messages.folderId, folderId)).run()
  return rows.length
}

/** Permanently delete every message the spam classifier flagged for an account (Empty Junk). */
export async function deleteSpam(accountId: string): Promise<{ deleted: number }> {
  const db = getDb()
  const rows = db
    .select({ id: messages.id, uid: messages.uid, folderId: messages.folderId })
    .from(messages)
    .where(and(eq(messages.accountId, accountId), eq(messages.isSpam, true)))
    .all()
  if (rows.length === 0) return { deleted: 0 }

  const byFolder = new Map<string, number[]>()
  for (const row of rows) {
    const list = byFolder.get(row.folderId) ?? []
    list.push(row.uid)
    byFolder.set(row.folderId, list)
  }

  await withImap(accountId, async (client) => {
    for (const [folderId, uids] of byFolder) {
      const folder = db.select().from(folders).where(eq(folders.id, folderId)).get()
      if (!folder) continue
      await client.mailboxOpen(folder.remotePath)
      await client.messageDelete(uids, { uid: true })
    }
  })

  for (const row of rows) removeFromIndex(row.id)
  db.delete(messages)
    .where(and(eq(messages.accountId, accountId), eq(messages.isSpam, true)))
    .run()
  return { deleted: rows.length }
}
