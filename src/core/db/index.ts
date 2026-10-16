import type Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { join } from 'node:path'
import { mkdirSync, rmSync } from 'node:fs'
import { migrations } from './migrations'
import * as schema from './schema'
import { openDriver, selectedDriver } from './driver'

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
  const path = databasePath(dataDir)

  const open = (): Database.Database => {
    const handle = openDriver(path)
    try {
      // WAL on desktop. The WASM driver's VFS leaves -wal/-shm files that lock
      // the next open, so it uses the default journal mode.
      if (selectedDriver() === 'better-sqlite3') handle.pragma('journal_mode = WAL')
      handle.pragma('foreign_keys = ON')
      handle.pragma('synchronous = NORMAL')
    } catch {
      // pragmas are best-effort
    }
    applyMigrations(handle)
    return handle
  }

  try {
    sqlite = open()
  } catch {
    // Recover from a stale WAL lock left by an earlier build (the WAL files are
    // SQLite's own journal, not user data). Retry once with a clean journal.
    try {
      sqlite?.close()
    } catch {
      // ignore
    }
    sqlite = null
    for (const suffix of ['-wal', '-shm']) {
      try {
        rmSync(`${path}${suffix}`, { force: true })
      } catch {
        // ignore
      }
    }
    sqlite = open()
  }

  db = drizzle(sqlite, { schema })
  return db
}

export function getDb(): CloverDatabase {
  if (!db) throw new Error('Database not initialized. Call initDatabase(dataDir) first.')
  return db
}

/**
 * The active SQLite driver handle (better-sqlite3 on desktop, node-sqlite3-wasm
 * on Android), for FTS5 and other statements Drizzle does not model. Both
 * expose the same better-sqlite3-compatible surface.
 */
export function getRawDb(): Database.Database {
  if (!sqlite) throw new Error('Database not initialized. Call initDatabase(dataDir) first.')
  return sqlite
}

export function closeDatabase(): void {
  if (sqlite && sqlite.open) {
    sqlite.close()
  }
  sqlite = null
  db = null
}
