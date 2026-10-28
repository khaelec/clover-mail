/**
 * Whether a UID returned by an incremental `uidNext:*` fetch is actually new.
 *
 * RFC 3501 §2.3.1.1: a UID range ending in `*` always includes the mailbox's
 * last message, even when the range's start is higher than every assigned UID.
 * So every sync after new mail re-fetches the newest message; re-inserting it
 * re-announced (and re-chimed) the same unread mail until it was read.
 *
 * A null boundary means the fetch was a full/backfill pass, where every UID is
 * expected to be accepted.
 */
export function isNewUid(uid: number, boundary: number | null): boolean {
  return boundary === null || uid >= boundary
}
