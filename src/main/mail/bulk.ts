import { and, eq } from 'drizzle-orm'
import { getDb } from '../db'
import { folders, messages } from '../db/schema'
import { moveMessage, setFlags } from './messages'
import { withImap } from './connection'
import { protocolFor } from './accounts'
import { removeFromIndex } from './search'
import type { BulkActionInput, BulkActionResult, MovedMessage } from '@shared/mail'

function specialFolderId(accountId: string, use: string): string | undefined {
  return getDb()
    .select()
    .from(folders)
    .where(and(eq(folders.accountId, accountId), eq(folders.specialUse, use)))
    .get()?.id
}

export async function bulkAction(input: BulkActionInput): Promise<BulkActionResult> {
  const result: BulkActionResult = { moved: 0, updated: 0, failed: 0 }
  const undo: MovedMessage[] = []
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
        const moved = await moveMessage(id, target)
        if (moved) {
          undo.push(moved)
          result.moved += 1
        } else result.failed += 1
      } else if (input.action === 'trash') {
        const target = specialFolderId(row.accountId, 'trash')
        if (!target) {
          result.failed += 1
          continue
        }
        const moved = await moveMessage(id, target)
        if (moved) {
          undo.push(moved)
          result.moved += 1
        } else result.failed += 1
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
        const moved = await moveMessage(id, input.targetFolderId)
        if (moved) {
          undo.push(moved)
          result.moved += 1
        } else result.failed += 1
      }
    } catch {
      result.failed += 1
    }
  }

  if (undo.length > 0) result.undo = undo
  return result
}

/**
 * Reverse a set of moves (undo). Each message is moved from where it landed back
 * to the folder it came from, located by its destination UID (or, if the server
 * didn't report one, by its Message-ID header). Returns the origin folders that
 * need re-syncing so the restored messages reappear locally.
 */
export async function undoMoves(
  moves: MovedMessage[]
): Promise<{ restored: number; failed: number; folderIds: string[] }> {
  const db = getDb()
  let restored = 0
  let failed = 0
  const folderIds = new Set<string>()

  for (const move of moves) {
    try {
      const from = db.select().from(folders).where(eq(folders.id, move.fromFolderId)).get()
      const to = db.select().from(folders).where(eq(folders.id, move.toFolderId)).get()
      if (!from || !to) {
        failed += 1
        continue
      }

      if (protocolFor(move.accountId) !== 'imap') {
        // Local move kept the row in place, so just point it back.
        const row =
          move.uid !== null
            ? db
                .select()
                .from(messages)
                .where(and(eq(messages.folderId, move.toFolderId), eq(messages.uid, move.uid)))
                .get()
            : null
        if (row) {
          db.update(messages).set({ folderId: move.fromFolderId }).where(eq(messages.id, row.id)).run()
          restored += 1
          folderIds.add(move.fromFolderId)
        } else failed += 1
        continue
      }

      await withImap(move.accountId, async (client) => {
        await client.mailboxOpen(to.remotePath)
        let uids: number[] = []
        if (move.uid !== null) {
          uids = [move.uid]
        } else if (move.messageId) {
          const found = await client.search(
            { header: { 'message-id': move.messageId } },
            { uid: true }
          )
          uids = Array.isArray(found) ? found : []
        }
        if (uids.length === 0) throw new Error('message not found in destination')
        await client.messageMove(uids, from.remotePath, { uid: true })
      })
      restored += 1
      folderIds.add(move.fromFolderId)
    } catch {
      failed += 1
    }
  }

  return { restored, failed, folderIds: [...folderIds] }
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

  if (protocolFor(folder.accountId) === 'imap') {
    await withImap(folder.accountId, async (client) => {
      await client.mailboxOpen(folder.remotePath)
      await client.messageDelete(
        rows.map((r) => r.uid),
        { uid: true }
      )
    })
  }

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

  if (protocolFor(folder.accountId) === 'imap') {
    await withImap(folder.accountId, async (client) => {
      await client.mailboxOpen(folder.remotePath)
      await client.messageFlagsAdd(
        rows.map((r) => r.uid),
        ['\\Seen'],
        { uid: true }
      )
    })
  }
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

  if (protocolFor(accountId) === 'imap') {
    await withImap(accountId, async (client) => {
      for (const [folderId, uids] of byFolder) {
        const folder = db.select().from(folders).where(eq(folders.id, folderId)).get()
        if (!folder) continue
        await client.mailboxOpen(folder.remotePath)
        await client.messageDelete(uids, { uid: true })
      }
    })
  }

  for (const row of rows) removeFromIndex(row.id)
  db.delete(messages)
    .where(and(eq(messages.accountId, accountId), eq(messages.isSpam, true)))
    .run()
  return { deleted: rows.length }
}
