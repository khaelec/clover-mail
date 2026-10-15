/**
 * Short-lived per-folder UID sets used to suppress spurious events.
 *
 * - "restored": UIDs that Undo just moved back into a folder. The next sync
 *   fetches them as new (IMAP gives a moved message a new UID), but the user did
 *   nothing, so they must not raise a new-mail notification. (0.4.60's refill
 *   will use the same idea for UIDs it re-fetched after a removal.)
 *
 * - "removed": UIDs Clover just deleted locally (and told the server to delete).
 *   If the server's SEARCH still lists one before it processes the delete, refill
 *   must not re-add it. (0.4.60.)
 *
 * Entries expire after ten minutes and are pruned lazily.
 */
const TTL_MS = 10 * 60_000

interface Entry {
  uids: Set<number>
  at: number
}

const restored = new Map<string, Entry>()
const removed = new Map<string, Entry>()

function key(accountId: string, folderId: string): string {
  return `${accountId}\u0000${folderId}`
}

function mark(map: Map<string, Entry>, accountId: string, folderId: string, uids: number[]): void {
  if (uids.length === 0) return
  const k = key(accountId, folderId)
  const entry = map.get(k) ?? { uids: new Set<number>(), at: Date.now() }
  for (const uid of uids) entry.uids.add(uid)
  entry.at = Date.now()
  map.set(k, entry)
}

function has(map: Map<string, Entry>, accountId: string, folderId: string, uid: number): boolean {
  const k = key(accountId, folderId)
  const entry = map.get(k)
  if (!entry) return false
  if (Date.now() - entry.at > TTL_MS) {
    map.delete(k)
    return false
  }
  return entry.uids.has(uid)
}

export function markRecentlyRestored(accountId: string, folderId: string, uids: number[]): void {
  mark(restored, accountId, folderId, uids)
}

export function isRecentlyRestored(accountId: string, folderId: string, uid: number): boolean {
  return has(restored, accountId, folderId, uid)
}

export function markRecentlyRemoved(accountId: string, folderId: string, uids: number[]): void {
  mark(removed, accountId, folderId, uids)
}

export function isRecentlyRemoved(accountId: string, folderId: string, uid: number): boolean {
  return has(removed, accountId, folderId, uid)
}
