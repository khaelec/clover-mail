import { and, eq } from 'drizzle-orm'
import { getDb } from '../db'
import { folders, messages } from '../db/schema'
import { removeFromIndex } from './search'
import { logLine } from '../log'

/** The only thing reconciliation needs from an IMAP client. */
export interface ReconcileClient {
  search(query: { uid: string }, options: { uid: true }): Promise<number[] | false | undefined>
}

/**
 * What the check actually did. The caller must only record the folder's
 * lastMessages/lastUidNext for 'ok' and 'skipped' — otherwise a transient
 * failure would make the next sync think nothing changed and skip forever.
 */
export type ReconcileStatus = 'ok' | 'skipped' | 'failed' | 'suspect' | 'dryrun'

/** Dev-only: log what reconciliation would remove without deleting anything. */
export const RECONCILE_DRYRUN = process.env.CLOVER_RECONCILE_DRYRUN === '1'

/**
 * Remove cached messages that no longer exist on the server (deleted or moved by
 * another client), so they don't linger as ghosts.
 *
 * Safety: a failed or non-array search deletes nothing (a server briefly
 * returning an empty result must not wipe the cache); a suspicious mass deletion
 * — including *every* cached row vanishing in a small folder — is only acted on
 * once the next sync confirms it; and negative UIDs (local sent-copy
 * placeholders) are never touched. Only rows in this account+folder are considered.
 */
export async function reconcileMailbox(
  client: ReconcileClient,
  accountId: string,
  folderId: string,
  folderRow: typeof folders.$inferSelect,
  messagesCount: number,
  uidNext: number
): Promise<ReconcileStatus> {
  const db = getDb()

  // Nothing can have been deleted if the count and uidNext are unchanged.
  if (
    !folderRow.reconcileSuspect &&
    folderRow.lastMessages === messagesCount &&
    folderRow.lastUidNext === uidNext
  ) {
    return 'skipped'
  }

  const local = db
    .select({ id: messages.id, uid: messages.uid })
    .from(messages)
    .where(and(eq(messages.accountId, accountId), eq(messages.folderId, folderId)))
    .all()
  // Only real server UIDs; negative UIDs are local sent-copy placeholders.
  const cached = local.filter((row) => row.uid > 0)
  if (cached.length === 0) return 'skipped'

  // Loops, not spread: a large folder would blow the argument limit.
  let min = Infinity
  let max = -Infinity
  for (const row of cached) {
    if (row.uid < min) min = row.uid
    if (row.uid > max) max = row.uid
  }

  let serverUids: number[]
  try {
    // Ask only about the cached UID range, not the whole mailbox.
    const found = await client.search({ uid: `${min}:${max}` }, { uid: true })
    if (!Array.isArray(found)) {
      logLine('reconcile', `${folderRow.remotePath}: failed (no UID list)`)
      return 'failed'
    }
    serverUids = found
  } catch (error) {
    logLine('reconcile', `${folderRow.remotePath}: failed (${error instanceof Error ? error.message : String(error)})`)
    return 'failed'
  }

  const serverSet = new Set(serverUids)
  const missing = cached.filter((row) => !serverSet.has(row.uid))
  if (missing.length === 0) {
    if (folderRow.reconcileSuspect) {
      db.update(folders).set({ reconcileSuspect: false }).where(eq(folders.id, folderId)).run()
    }
    return 'ok'
  }

  // Mass-deletion guard: >20 and >half, or *everything* in a small folder. A
  // server that briefly returns an empty result must not wipe the cache; confirm
  // across two syncs before acting.
  const suspicious =
    (missing.length > 20 && missing.length > cached.length / 2) ||
    (missing.length === cached.length && cached.length > 1)
  if (suspicious && !folderRow.reconcileSuspect) {
    db.update(folders).set({ reconcileSuspect: true }).where(eq(folders.id, folderId)).run()
    logLine('reconcile', `${folderRow.remotePath}: suspect (${missing.length}/${cached.length} missing)`)
    return 'suspect'
  }

  if (RECONCILE_DRYRUN) {
    const detail = `would remove ${missing.length}/${cached.length} from ${folderRow.remotePath}: uids ${missing
      .map((row) => row.uid)
      .join(',')}`
    logLine('reconcile', `dryrun: ${detail}`)
    console.log(`[reconcile] ${detail}`)
    return 'dryrun'
  }

  const removedIds = missing.map((row) => row.id)
  db.transaction((tx) => {
    for (const id of removedIds) tx.delete(messages).where(eq(messages.id, id)).run()
  })
  for (const id of removedIds) removeFromIndex(id)
  db.update(folders).set({ reconcileSuspect: false }).where(eq(folders.id, folderId)).run()
  logLine('reconcile', `${folderRow.remotePath}: removed ${removedIds.length}`)
  return 'ok'
}
