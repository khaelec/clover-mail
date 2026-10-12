import { randomUUID } from 'node:crypto'
import { asc, eq } from 'drizzle-orm'
import { getDb } from '../db'
import { accountAliases } from '../db/schema'
import type { AccountAlias } from '@shared/mail'

export function listAliases(accountId: string): AccountAlias[] {
  return getDb()
    .select()
    .from(accountAliases)
    .where(eq(accountAliases.accountId, accountId))
    .orderBy(asc(accountAliases.createdAt))
    .all()
    .map((row) => ({ id: row.id, accountId: row.accountId, name: row.name, email: row.email }))
}

export function addAlias(accountId: string, email: string, name?: string): AccountAlias {
  const id = randomUUID()
  getDb()
    .insert(accountAliases)
    .values({
      id,
      accountId,
      email: email.trim(),
      name: name?.trim() || null,
      createdAt: Date.now()
    })
    .run()
  return listAliases(accountId).find((a) => a.id === id) as AccountAlias
}

export function deleteAlias(id: string): void {
  getDb().delete(accountAliases).where(eq(accountAliases.id, id)).run()
}
