/**
 * Short-lived per-folder UID sets used to suppress spurious events.
 *
 * - "restored": UIDs that Undo just moved back into a folder. The next sync
 *   fetches them as new (IMAP gives a moved message a new UID), but the user did
 *   nothing, so they must not raise a new-mail notification. (0.4.60's refill
 *   will use the same idea for UIDs it re-fetched after a removal.)
 *
 * Entries expire after ten minutes and are pruned lazily.
 */
const TTL_MS = 10 * 60_000

interface Entry {
  uids: Set<number>
  at: number
}

const restored = new Map<string, Entry>()

function key(accountId: string, folderId: string): string {
  return `${accountId}\u0000${folderId}`
}

export function markRecentlyRestored(accountId: string, folderId: string, uids: number[]): void {
  if (uids.length === 0) return
  const k = key(accountId, folderId)
  const entry = restored.get(k) ?? { uids: new Set<number>(), at: Date.now() }
  for (const uid of uids) entry.uids.add(uid)
  entry.at = Date.now()
  restored.set(k, entry)
}

export function isRecentlyRestored(accountId: string, folderId: string, uid: number): boolean {
  const k = key(accountId, folderId)
  const entry = restored.get(k)
  if (!entry) return false
  if (Date.now() - entry.at > TTL_MS) {
    restored.delete(k)
    return false
  }
  return entry.uids.has(uid)
}
