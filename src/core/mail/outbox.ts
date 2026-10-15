import { randomUUID } from 'node:crypto'
import { asc, eq } from 'drizzle-orm'
import { getDb } from '@core/db'
import { outbox } from '@core/db/schema'
import { deliverMessage } from './send'
import type { ComposeInput, OutboxItem } from '@shared/mail'

type Row = typeof outbox.$inferSelect

function toItem(row: Row): OutboxItem {
  let subject = ''
  let to: string[] = []
  try {
    const payload = JSON.parse(row.payload) as ComposeInput
    subject = payload.subject ?? ''
    to = payload.to ?? []
  } catch {
    // ignore malformed payload
  }
  return {
    id: row.id,
    accountId: row.accountId,
    subject,
    to,
    status: row.status as OutboxItem['status'],
    error: row.error,
    attempts: row.attempts,
    sendAt: row.sendAt,
    createdAt: row.createdAt
  }
}

/** Queue an outgoing message. `sendAt` in the future keeps it scheduled. */
export function enqueueOutbox(input: ComposeInput, sendAt = Date.now()): string {
  const id = randomUUID()
  const now = Date.now()
  getDb()
    .insert(outbox)
    .values({
      id,
      accountId: input.accountId,
      payload: JSON.stringify(input),
      status: 'queued',
      error: null,
      attempts: 0,
      sendAt,
      createdAt: now,
      updatedAt: now
    })
    .run()
  return id
}

export function listOutbox(): OutboxItem[] {
  return getDb().select().from(outbox).orderBy(asc(outbox.sendAt)).all().map(toItem)
}

export function outboxCount(): number {
  return getDb().select().from(outbox).all().length
}

export function cancelOutbox(id: string): void {
  getDb().delete(outbox).where(eq(outbox.id, id)).run()
}

/** Put a failed message back in the queue and try again now. */
export function retryOutbox(id: string): void {
  getDb()
    .update(outbox)
    .set({ status: 'queued', error: null, sendAt: Date.now(), updatedAt: Date.now() })
    .where(eq(outbox.id, id))
    .run()
}

/** Attempt to deliver one queued message. Keeps the row on failure for retry. */
async function deliverRow(row: Row): Promise<boolean> {
  const db = getDb()
  db.update(outbox)
    .set({ status: 'sending', updatedAt: Date.now() })
    .where(eq(outbox.id, row.id))
    .run()
  try {
    await deliverMessage(JSON.parse(row.payload) as ComposeInput)
    db.delete(outbox).where(eq(outbox.id, row.id)).run()
    return true
  } catch (error) {
    db.update(outbox)
      .set({
        status: 'failed',
        error: (error as Error).message,
        attempts: row.attempts + 1,
        updatedAt: Date.now()
      })
      .where(eq(outbox.id, row.id))
      .run()
    return false
  }
}

/** Send a message now, via the outbox (so a failure is visible and retryable). */
export async function sendNow(input: ComposeInput): Promise<void> {
  const id = enqueueOutbox(input, Date.now())
  const row = getDb().select().from(outbox).where(eq(outbox.id, id)).get()
  if (!row) return
  const ok = await deliverRow(row)
  if (!ok) {
    const failed = getDb().select().from(outbox).where(eq(outbox.id, id)).get()
    throw new Error(failed?.error ?? 'Could not send the message')
  }
}

/** Deliver every due queued message, plus a few automatic retries of failures. */
export async function processOutbox(now = Date.now()): Promise<number> {
  const rows = getDb().select().from(outbox).orderBy(asc(outbox.sendAt)).all()
  const due = rows.filter(
    (row) =>
      (row.status === 'queued' && row.sendAt <= now) ||
      (row.status === 'failed' && row.attempts < 3 && now - row.updatedAt > 60_000)
  )
  let sent = 0
  for (const row of due) {
    if (await deliverRow(row)) sent += 1
  }
  return sent
}
