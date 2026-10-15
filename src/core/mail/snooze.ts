import { and, eq, isNotNull, lt } from 'drizzle-orm'
import { getDb } from '@core/db'
import { messages } from '@core/db/schema'

export function snooze(messageId: string, untilMs: number): void {
  getDb().update(messages).set({ snoozedUntil: untilMs }).where(eq(messages.id, messageId)).run()
}

export function unsnooze(messageId: string): void {
  getDb().update(messages).set({ snoozedUntil: null }).where(eq(messages.id, messageId)).run()
}

/** Clear any snoozes that are now due; returns the affected message ids. */
export function clearDueSnoozes(now: number): string[] {
  const db = getDb()
  const due = db
    .select({ id: messages.id })
    .from(messages)
    .where(and(isNotNull(messages.snoozedUntil), lt(messages.snoozedUntil, now)))
    .all()
  for (const row of due) {
    db.update(messages).set({ snoozedUntil: null }).where(eq(messages.id, row.id)).run()
  }
  return due.map((row) => row.id)
}
