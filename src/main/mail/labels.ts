import { randomUUID } from 'node:crypto'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { getDb } from '@core/db'
import { labels, messageLabels, messages } from '@core/db/schema'
import { toMessageSummary } from './mappers'
import type { Label, MessageSummary } from '@shared/mail'

const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#f43f5e', '#64748b']

export function listLabels(): Label[] {
  return getDb()
    .select()
    .from(labels)
    .orderBy(asc(labels.createdAt))
    .all()
    .map((row) => ({ id: row.id, name: row.name, color: row.color }))
}

export function createLabel(name: string, color?: string): Label {
  const id = randomUUID()
  const chosen = color ?? COLORS[listLabels().length % COLORS.length]
  getDb().insert(labels).values({ id, name, color: chosen, createdAt: Date.now() }).run()
  return { id, name, color: chosen }
}

export function deleteLabel(id: string): void {
  const db = getDb()
  db.delete(messageLabels).where(eq(messageLabels.labelId, id)).run()
  db.delete(labels).where(eq(labels.id, id)).run()
}

export function addLabelToMessage(messageId: string, labelId: string): void {
  getDb().insert(messageLabels).values({ messageId, labelId }).onConflictDoNothing().run()
}

export function removeLabelFromMessage(messageId: string, labelId: string): void {
  getDb()
    .delete(messageLabels)
    .where(and(eq(messageLabels.messageId, messageId), eq(messageLabels.labelId, labelId)))
    .run()
}

export function labelIdsForMessage(messageId: string): string[] {
  return getDb()
    .select()
    .from(messageLabels)
    .where(eq(messageLabels.messageId, messageId))
    .all()
    .map((row) => row.labelId)
}

export function listLabelMessages(labelId: string): MessageSummary[] {
  const ids = getDb()
    .select()
    .from(messageLabels)
    .where(eq(messageLabels.labelId, labelId))
    .all()
    .map((row) => row.messageId)
  if (ids.length === 0) return []
  return getDb()
    .select()
    .from(messages)
    .where(inArray(messages.id, ids))
    .all()
    .sort((a, b) => (b.dateUtc ?? 0) - (a.dateUtc ?? 0))
    .map(toMessageSummary)
}
