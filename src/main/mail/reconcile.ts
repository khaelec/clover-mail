import { and, eq } from 'drizzle-orm'
import { getDb } from '../db'
import { folders, messages } from '../db/schema'
import { removeFromIndex } from './search'

/** The only thing reconciliation needs from an IMAP client. */
export interface ReconcileClient {
  search(query: { uid: string }, options: { uid: true }): Promise<number[] | false | undefined>
}

/** Dev-only: log what reconciliation would remove without deleting anything. */
export const RECONCILE_DRYRUN = process.env.CLOVER_RECONCILE_DRYRUN === '1'

/**
 * Remove cached messages that no longer exist on the server (deleted or moved by
 * another client), so they don't linger as ghosts.
 *
 * Safety: a failed or non-array search deletes nothing (a server briefly
 * returning an empty result must not wipe the cache); a suspicious mass deletion
 * is only acted on once the next sync confirms it; and negative UIDs (local
 * sent-copy placeholders) are never touched. Only rows in this account+folder
 * are considered.
 */
export async function reconcileMailbox(
  client: ReconcileClient,
  accountId: string,
  folderId: string,
  folderRow: typeof folders.$inferSelect,
  messagesCount: number,
  uidNext: number
): Promise<number> {
  const db = getDb()

  // Nothing can have been deleted if the count and uidNext are unchanged.
  if (
    !folderRow.reconcileSuspect &&
    folderRow.lastMessages === messagesCount &&
    folderRow.lastUidNext === uidNext
  ) {
    return 0
  }

  const local = db
    .select({ id: messages.id, uid: messages.uid })
    .from(messages)
    .where(and(eq(messages.accountId, accountId), eq(messages.folderId, folderId)))
    .all()
  // Only real server UIDs; negative UIDs are local sent-copy placeholders.
  const cached = local.filter((row) => row.uid > 0)
  if (cached.length === 0) return 0

  const min = Math.min(...cached.map((row) => row.uid))
  const max = Math.max(...cached.map((row) => row.uid))
  let serverUids: number[]
  try {
    // Ask only about the cached UID range, not the whole mailbox.
    const found = await client.search({ uid: `${min}:${max}` }, { uid: true })
    if (!Array.isArray(found)) return 0
    serverUids = found
  } catch {
    return 0
  }

  const serverSet = new Set(serverUids)
  const missing = cached.filter((row) => !serverSet.has(row.uid))
  if (missing.length === 0) {
    if (folderRow.reconcileSuspect) {
      db.update(folders).set({ reconcileSuspect: false }).where(eq(folders.id, folderId)).run()
    }
    return 0
  }

  // Mass-deletion guard: confirm across two syncs before wiping the cache.
  if (missing.length > 20 && missing.length > cached.length / 2) {
    if (!folderRow.reconcileSuspect) {
      db.update(folders).set({ reconcileSuspect: true }).where(eq(folders.id, folderId)).run()
      return 0
    }
  }

  if (RECONCILE_DRYRUN) {
    console.log(
      `[reconcile] would remove ${missing.length}/${cached.length} from ${folderRow.remotePath}: uids ${missing
        .map((row) => row.uid)
        .join(',')}`
    )
    return 0
  }

  const removedIds = missing.map((row) => row.id)
  db.transaction((tx) => {
    for (const id of removedIds) tx.delete(messages).where(eq(messages.id, id)).run()
  })
  for (const id of removedIds) removeFromIndex(id)
  db.update(folders).set({ reconcileSuspect: false }).where(eq(folders.id, folderId)).run()
  return removedIds.length
}
