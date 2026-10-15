import { randomUUID } from 'node:crypto'
import { asc, eq } from 'drizzle-orm'
import { getDb } from '@core/db'
import { accountAliases } from '@core/db/schema'
import { deleteSetting, getSetting, setSetting } from '../settings'
import type { AccountAlias } from '@shared/mail'

const DEFAULT_FROM_PREFIX = 'mail.defaultFrom.'

/** The address new/reply messages are sent from by default (an alias, or null for the account address). */
export function getDefaultFrom(accountId: string): string | null {
  const value = getSetting<string>(DEFAULT_FROM_PREFIX + accountId)
  return typeof value === 'string' && value ? value : null
}

export function setDefaultFrom(accountId: string, email: string | null): void {
  if (!email) deleteSetting(DEFAULT_FROM_PREFIX + accountId)
  else setSetting(DEFAULT_FROM_PREFIX + accountId, email)
}

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
