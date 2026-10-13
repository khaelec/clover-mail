import { enqueueOutbox, listOutbox, cancelOutbox, processOutbox } from './outbox'
import type { ComposeInput } from '@shared/mail'

export interface ScheduledSend {
  id: string
  accountId: string
  subject: string
  sendAt: number
}

/** Schedule a send by queueing it in the outbox with a future send time. */
export function scheduleSend(payload: ComposeInput, sendAt: number): string {
  return enqueueOutbox(payload, sendAt)
}

export function listScheduled(): ScheduledSend[] {
  const now = Date.now()
  return listOutbox()
    .filter((item) => item.sendAt > now)
    .map((item) => ({
      id: item.id,
      accountId: item.accountId,
      subject: item.subject,
      sendAt: item.sendAt
    }))
}

export function cancelScheduled(id: string): void {
  cancelOutbox(id)
}

/** Send any due queued messages; returns how many were sent. */
export async function processDueSends(now: number): Promise<number> {
  return processOutbox(now)
}
