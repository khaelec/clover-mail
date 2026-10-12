import { randomUUID } from 'node:crypto'
import { asc, eq } from 'drizzle-orm'
import { getDb } from '../db'
import { savedSearches } from '../db/schema'
import type { SavedSearch } from '@shared/mail'

export function listSavedSearches(): SavedSearch[] {
  return getDb()
    .select()
    .from(savedSearches)
    .orderBy(asc(savedSearches.createdAt))
    .all()
    .map((row) => ({ id: row.id, name: row.name, query: row.query }))
}

export function createSavedSearch(name: string, query: string): SavedSearch {
  const id = randomUUID()
  getDb().insert(savedSearches).values({ id, name, query, createdAt: Date.now() }).run()
  return { id, name, query }
}

export function deleteSavedSearch(id: string): void {
  getDb().delete(savedSearches).where(eq(savedSearches.id, id)).run()
}
