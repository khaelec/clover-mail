import { randomUUID } from 'node:crypto'
import { asc, eq } from 'drizzle-orm'
import { getDb } from '../db'
import { snippets } from '../db/schema'
import type { Snippet } from '@shared/mail'

export function listSnippets(): Snippet[] {
  return getDb()
    .select()
    .from(snippets)
    .orderBy(asc(snippets.createdAt))
    .all()
    .map((row) => ({ id: row.id, name: row.name, body: row.body }))
}

export function addSnippet(name: string, body: string): Snippet {
  const id = randomUUID()
  getDb().insert(snippets).values({ id, name, body, createdAt: Date.now() }).run()
  return { id, name, body }
}

export function deleteSnippet(id: string): void {
  getDb().delete(snippets).where(eq(snippets.id, id)).run()
}
