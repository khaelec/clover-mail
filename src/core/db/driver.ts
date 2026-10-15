import Database from 'better-sqlite3'
import { openWasmDatabase } from './driverWasm'

export type DriverKind = 'better-sqlite3' | 'node-sqlite3-wasm'

/**
 * Which SQLite driver to open. Desktop uses better-sqlite3; Android
 * (nodejs-mobile) uses the synchronous WASM build, because better-sqlite3 ships
 * no Android prebuild. Set `CLOVER_DB_DRIVER=wasm` to exercise the WASM driver
 * under Node (the smoke tests and CI use this).
 */
export function selectedDriver(): DriverKind {
  return process.env.CLOVER_DB_DRIVER === 'wasm' ? 'node-sqlite3-wasm' : 'better-sqlite3'
}

/** Open the database with the selected driver. */
export function openDriver(path: string): Database.Database {
  if (selectedDriver() === 'node-sqlite3-wasm') {
    return openWasmDatabase(path) as unknown as Database.Database
  }
  return new Database(path)
}
