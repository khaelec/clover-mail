import { and, eq, lt } from 'drizzle-orm'
import { getDb } from '../db'
import { reminderLog } from '../db/schema'
import { listOccurrences } from './index'
import { getSetting } from '../settings'

export const REMINDER_MINUTES_KEY = 'calendar.reminderMinutes'

export function reminderMinutes(): number {
  const value = getSetting<number>(REMINDER_MINUTES_KEY)
  return typeof value === 'number' && value >= 0 ? value : 10
}

export interface DueReminder {
  eventId: string
  summary: string
  startUtc: number
  location: string | null
}

/** Occurrences starting within the reminder lead time that haven't been announced yet. */
export function dueReminders(now: number): DueReminder[] {
  const lead = reminderMinutes()
  if (lead <= 0) return []
  const horizon = now + lead * 60_000
  const occurrences = listOccurrences(now, horizon)
  const db = getDb()
  const out: DueReminder[] = []
  for (const occ of occurrences) {
    if (occ.startUtc <= now || occ.startUtc > horizon) continue
    const already = db
      .select()
      .from(reminderLog)
      .where(
        and(
          eq(reminderLog.eventId, occ.eventId),
          eq(reminderLog.occurrenceStart, occ.startUtc)
        )
      )
      .get()
    if (already) continue
    out.push({
      eventId: occ.eventId,
      summary: occ.summary ?? '(no title)',
      startUtc: occ.startUtc,
      location: occ.location
    })
  }
  return out
}

export function markReminded(eventId: string, occurrenceStart: number): void {
  const db = getDb()
  db.insert(reminderLog)
    .values({ eventId, occurrenceStart, createdAt: Date.now() })
    .onConflictDoNothing()
    .run()
  // Keep the log small.
  db.delete(reminderLog)
    .where(lt(reminderLog.createdAt, Date.now() - 3 * 24 * 60 * 60 * 1000))
    .run()
}
