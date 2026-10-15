import { eq } from 'drizzle-orm'
import { getDb } from '@core/db'
import { threadSettings } from '@core/db/schema'

export interface ThreadFlags {
  muted: boolean
  pinned: boolean
}

export function listThreadFlags(): Map<string, ThreadFlags> {
  const map = new Map<string, ThreadFlags>()
  for (const row of getDb().select().from(threadSettings).all()) {
    map.set(row.threadId, { muted: row.muted, pinned: row.pinned })
  }
  return map
}

function upsert(threadId: string, patch: Partial<ThreadFlags>): void {
  const db = getDb()
  const existing = db.select().from(threadSettings).where(eq(threadSettings.threadId, threadId)).get()
  if (existing) {
    db.update(threadSettings).set(patch).where(eq(threadSettings.threadId, threadId)).run()
  } else {
    db.insert(threadSettings)
      .values({
        threadId,
        muted: patch.muted ?? false,
        pinned: patch.pinned ?? false
      })
      .run()
  }
}

export function setThreadMuted(threadId: string, muted: boolean): void {
  upsert(threadId, { muted })
}

export function setThreadPinned(threadId: string, pinned: boolean): void {
  upsert(threadId, { pinned })
}

export function isThreadMuted(threadId: string | null): boolean {
  if (!threadId) return false
  const row = getDb()
    .select()
    .from(threadSettings)
    .where(eq(threadSettings.threadId, threadId))
    .get()
  return row?.muted ?? false
}
