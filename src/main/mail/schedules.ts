import { randomUUID } from 'node:crypto'
import { asc, eq, lt } from 'drizzle-orm'
import { getDb } from '../db'
import { scheduledSends } from '../db/schema'
import { sendMessage } from './send'
import type { ComposeInput } from '@shared/mail'

export interface ScheduledSend {
  id: string
  accountId: string
  subject: string
  sendAt: number
}

export function scheduleSend(payload: ComposeInput, sendAt: number): string {
  const id = randomUUID()
  getDb()
    .insert(scheduledSends)
    .values({
      id,
      accountId: payload.accountId,
      payload: JSON.stringify(payload),
      sendAt,
      createdAt: Date.now()
    })
    .run()
  return id
}

export function listScheduled(): ScheduledSend[] {
  return getDb()
    .select()
    .from(scheduledSends)
    .orderBy(asc(scheduledSends.sendAt))
    .all()
    .map((row) => {
      let subject = ''
      try {
        subject = (JSON.parse(row.payload) as ComposeInput).subject
      } catch {
        subject = ''
      }
      return { id: row.id, accountId: row.accountId, subject, sendAt: row.sendAt }
    })
}

export function cancelScheduled(id: string): void {
  getDb().delete(scheduledSends).where(eq(scheduledSends.id, id)).run()
}

/** Send any due scheduled messages; returns how many were sent. */
export async function processDueSends(now: number): Promise<number> {
  const db = getDb()
  const due = db.select().from(scheduledSends).where(lt(scheduledSends.sendAt, now)).all()
  let sent = 0
  for (const row of due) {
    try {
      await sendMessage(JSON.parse(row.payload) as ComposeInput)
      sent += 1
    } catch {
      // leave it? we delete regardless to avoid loops
    }
    db.delete(scheduledSends).where(eq(scheduledSends.id, row.id)).run()
  }
  return sent
}
