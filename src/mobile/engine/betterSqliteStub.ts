/**
 * Android has no better-sqlite3 (it ships no Android prebuild); the phone engine
 * uses node-sqlite3-wasm instead. This stub satisfies the static import in
 * src/core/db/driver.ts — it is never instantiated on the phone.
 */
export default class BetterSqliteNotAvailable {
  constructor() {
    throw new Error('better-sqlite3 is not available on Android; node-sqlite3-wasm is used instead.')
  }
}
