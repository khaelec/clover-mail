import { and, eq, inArray } from 'drizzle-orm'
import { getDb } from '../db'
import { folders, messages } from '../db/schema'
import { setFlags } from './messages'
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

interface MoveItem {
  id: string
  uid: number
  messageId: string | null
}
interface MoveGroup {
  accountId: string
  fromFolderId: string
  toFolderId: string
  items: MoveItem[]
}

function targetFolderFor(
  accountId: string,
  action: BulkActionInput['action'],
  targetFolderId?: string
): string | undefined {
  // Gmail-style archive: move out of Inbox to Archive / All Mail.
  if (action === 'archive') return specialFolderId(accountId, 'archive') ?? specialFolderId(accountId, 'all')
  if (action === 'trash') return specialFolderId(accountId, 'trash')
  if (action === 'move') return targetFolderId
  return undefined
}

/**
 * Move a whole (account, source folder, target folder) group with a single MOVE
 * command, reading the new UIDs from UIDPLUS's uidMap. That's one mailbox open +
 * one MOVE per group instead of two round-trips per message, so archiving 50
 * messages is a couple of round-trips, not a hundred.
 */
async function moveGroup(group: MoveGroup): Promise<MovedMessage[]> {
  const db = getDb()
  const from = db.select().from(folders).where(eq(folders.id, group.fromFolderId)).get()
  const to = db.select().from(folders).where(eq(folders.id, group.toFolderId)).get()
  if (!from || !to) throw new Error('folder not found')

  if (protocolFor(group.accountId) !== 'imap') {
    for (const item of group.items) {
      db.update(messages).set({ folderId: group.toFolderId }).where(eq(messages.id, item.id)).run()
    }
    return group.items.map((item) => ({
      accountId: group.accountId,
      fromFolderId: group.fromFolderId,
      toFolderId: group.toFolderId,
      uid: item.uid,
      messageId: item.messageId
    }))
  }

  const response = await withImap(group.accountId, async (client) => {
    await client.mailboxOpen(from.remotePath)
    return client.messageMove(
      group.items.map((i) => i.uid),
      to.remotePath,
      { uid: true }
    )
  })
  const uidMap = response && response.uidMap ? response.uidMap : null

  const undo: MovedMessage[] = []
  for (const item of group.items) {
    db.delete(messages).where(eq(messages.id, item.id)).run()
    removeFromIndex(item.id)
    undo.push({
      accountId: group.accountId,
      fromFolderId: group.fromFolderId,
      toFolderId: group.toFolderId,
      uid: uidMap ? (uidMap.get(item.uid) ?? null) : null,
      messageId: item.messageId
    })
  }
  return undo
}

export async function bulkAction(input: BulkActionInput): Promise<BulkActionResult> {
  const result: BulkActionResult = { moved: 0, updated: 0, failed: 0 }
  const db = getDb()

  if (input.action === 'archive' || input.action === 'trash' || input.action === 'move') {
    const groups = new Map<string, MoveGroup>()
    for (const id of input.messageIds) {
      const row = db.select().from(messages).where(eq(messages.id, id)).get()
      if (!row) {
        result.failed += 1
        continue
      }
      const toFolderId = targetFolderFor(row.accountId, input.action, input.targetFolderId)
      if (!toFolderId) {
        result.failed += 1
        continue
      }
      const key = `${row.accountId}\u0000${row.folderId}\u0000${toFolderId}`
      const group = groups.get(key) ?? {
        accountId: row.accountId,
        fromFolderId: row.folderId,
        toFolderId,
        items: []
      }
      group.items.push({ id, uid: row.uid, messageId: row.messageId })
      groups.set(key, group)
    }

    const undo: MovedMessage[] = []
    for (const group of groups.values()) {
      try {
        undo.push(...(await moveGroup(group)))
        result.moved += group.items.length
      } catch {
        result.failed += group.items.length
      }
    }
    if (undo.length > 0) result.undo = undo
    return result
  }

  // Flag-only actions stay per message.
  for (const id of input.messageIds) {
    try {
      const row = db.select().from(messages).where(eq(messages.id, id)).get()
      if (!row) {
        result.failed += 1
        continue
      }
      if (input.action === 'markRead') await setFlags(id, { seen: true })
      else if (input.action === 'markUnread') await setFlags(id, { seen: false })
      else if (input.action === 'markImportant') await setFlags(id, { important: true })
      else if (input.action === 'markNotImportant') await setFlags(id, { important: false })
      result.updated += 1
    } catch {
      result.failed += 1
    }
  }
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

  // Group by (account, destination, origin) so a whole undo is one MOVE back.
  const groups = new Map<string, MovedMessage[]>()
  for (const move of moves) {
    const key = `${move.accountId}\u0000${move.toFolderId}\u0000${move.fromFolderId}`
    const list = groups.get(key) ?? []
    list.push(move)
    groups.set(key, list)
  }

  for (const group of groups.values()) {
    const first = group[0]
    const from = db.select().from(folders).where(eq(folders.id, first.fromFolderId)).get()
    const to = db.select().from(folders).where(eq(folders.id, first.toFolderId)).get()
    if (!from || !to) {
      failed += group.length
      continue
    }

    if (protocolFor(first.accountId) !== 'imap') {
      // Local move kept the row in place, so just point it back.
      for (const move of group) {
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
      }
      continue
    }

    // One mailbox open + one MOVE back for the whole group.
    const movedUids: number[] = []
    let missing = 0
    await withImap(first.accountId, async (client) => {
      await client.mailboxOpen(to.remotePath)
      for (const move of group) {
        if (move.uid !== null) {
          movedUids.push(move.uid)
        } else if (move.messageId) {
          const found = await client.search(
            { header: { 'message-id': move.messageId } },
            { uid: true }
          )
          const list = Array.isArray(found) ? found : []
          // A copy may already exist in the destination; the one we just moved is
          // always the newest, so only undo that one.
          if (list.length) movedUids.push(Math.max(...list))
          else missing += 1
        } else {
          missing += 1
        }
      }
      if (movedUids.length > 0) await client.messageMove(movedUids, from.remotePath, { uid: true })
    })

    // The move back leaves the local copy in the destination behind (sync only
    // ever adds new UIDs, it never notices removed ones), so drop it or the
    // message would appear in both folders forever.
    if (movedUids.length > 0) {
      const ghosts = db
        .select({ id: messages.id })
        .from(messages)
        .where(and(eq(messages.folderId, first.toFolderId), inArray(messages.uid, movedUids)))
        .all()
      for (const ghost of ghosts) {
        db.delete(messages).where(eq(messages.id, ghost.id)).run()
        removeFromIndex(ghost.id)
      }
      restored += movedUids.length
      folderIds.add(first.fromFolderId)
    }
    failed += missing
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
