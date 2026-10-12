import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { migrations } from './migrations'
import * as schema from './schema'

type CloverDatabase = BetterSQLite3Database<typeof schema>

let sqlite: Database.Database | null = null
let db: CloverDatabase | null = null

export function databasePath(dataDir: string): string {
  return join(dataDir, 'clover-mail.db')
}

function applyMigrations(handle: Database.Database): void {
  handle.exec(`
    CREATE TABLE IF NOT EXISTS __migrations (
      id TEXT PRIMARY KEY NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `)

  const applied = new Set(
    handle
      .prepare('SELECT id FROM __migrations')
      .all()
      .map((row) => (row as { id: string }).id)
  )

  const record = handle.prepare(
    'INSERT INTO __migrations (id, applied_at) VALUES (?, ?)'
  )

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue
    const run = handle.transaction(() => {
      handle.exec(migration.sql)
      record.run(migration.id, Date.now())
    })
    run()
  }
}

export function initDatabase(dataDir: string): CloverDatabase {
  if (db) return db

  mkdirSync(dataDir, { recursive: true })

  sqlite = new Database(databasePath(dataDir))
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('synchronous = NORMAL')

  applyMigrations(sqlite)

  db = drizzle(sqlite, { schema })
  return db
}

export function getDb(): CloverDatabase {
  if (!db) throw new Error('Database not initialized. Call initDatabase(dataDir) first.')
  return db
}

export function closeDatabase(): void {
  if (sqlite && sqlite.open) {
    sqlite.close()
  }
  sqlite = null
  db = null
}
