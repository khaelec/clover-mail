import { Database as WasmDatabase } from 'node-sqlite3-wasm'

/**
 * A `better-sqlite3`-compatible facade over `node-sqlite3-wasm`, so Drizzle's
 * better-sqlite3 adapter (and the raw FTS5 calls) work unchanged on Android,
 * where better-sqlite3 has no prebuild. node-sqlite3-wasm is synchronous and
 * file-backed with FTS5, so the engine stays synchronous everywhere.
 *
 * Only the surface Drizzle and the engine use is implemented: prepare →
 * run/all/get/raw, exec, pragma, transaction, close.
 */

interface BetterRunResult {
  changes: number
  lastInsertRowid: number | bigint
}

type WasmStatementHandle = ReturnType<WasmDatabase['prepare']>

class WasmStatement {
  constructor(
    private readonly stmt: WasmStatementHandle,
    private readonly rawMode: boolean
  ) {}

  /** node-sqlite3-wasm binds an array; better-sqlite3 binds variadic params. */
  private bind(values: unknown[]): never {
    return (values.length > 0 ? values : undefined) as never
  }

  run(...values: unknown[]): BetterRunResult {
    const result = this.stmt.run(this.bind(values))
    return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) }
  }

  get(...values: unknown[]): unknown {
    const row = this.stmt.get(this.bind(values))
    if (!row) return undefined
    return this.rawMode ? Object.values(row as Record<string, unknown>) : row
  }

  all(...values: unknown[]): unknown[] {
    const rows = this.stmt.all(this.bind(values)) as Record<string, unknown>[]
    return this.rawMode ? rows.map((row) => Object.values(row)) : rows
  }

  // better-sqlite3's fluent modifiers. Drizzle only uses raw(); the rest are
  // no-ops kept for API compatibility.
  raw(toggle = true): WasmStatement {
    return new WasmStatement(this.stmt, toggle)
  }
  pluck(): WasmStatement {
    return this
  }
  safeIntegers(): WasmStatement {
    return this
  }
  columns(): unknown[] {
    return []
  }
}

export class WasmDatabaseHandle {
  private readonly db: WasmDatabase
  open = true

  constructor(path: string) {
    this.db = new WasmDatabase(path)
  }

  prepare(sql: string): WasmStatement {
    return new WasmStatement(this.db.prepare(sql), false)
  }

  exec(sql: string): void {
    this.db.exec(sql)
  }

  pragma(source: string): unknown {
    try {
      const rows = this.db.all(`PRAGMA ${source}`) as Record<string, unknown>[]
      if (rows.length === 1) return Object.values(rows[0])[0]
      return rows
    } catch {
      this.db.exec(`PRAGMA ${source}`)
      return undefined
    }
  }

  // better-sqlite3's transaction() returns a function that also exposes
  // .deferred / .immediate / .exclusive variants; Drizzle calls one of them.
  transaction<T extends (...args: never[]) => unknown>(fn: T): T {
    const make = (behavior: string) => {
      return (...args: never[]): unknown => {
        this.db.exec(`BEGIN ${behavior}`)
        try {
          const result = fn(...args)
          this.db.exec('COMMIT')
          return result
        } catch (error) {
          this.db.exec('ROLLBACK')
          throw error
        }
      }
    }
    const tx = make('DEFERRED') as T & {
      deferred: unknown
      immediate: unknown
      exclusive: unknown
    }
    tx.deferred = make('DEFERRED')
    tx.immediate = make('IMMEDIATE')
    tx.exclusive = make('EXCLUSIVE')
    return tx
  }

  close(): void {
    this.db.close()
    this.open = false
  }
}

export function openWasmDatabase(path: string): WasmDatabaseHandle {
  return new WasmDatabaseHandle(path)
}
