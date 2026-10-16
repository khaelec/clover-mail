// Android has no better-sqlite3 prebuild, so the engine runs on node-sqlite3-wasm.
// Drizzle's better-sqlite3 adapter requires this module when it loads, but the
// phone engine never constructs it — so this stub just has to resolve.
module.exports = class BetterSqlite3NotAvailable {
  constructor() {
    throw new Error(
      'better-sqlite3 is not available on Android; the node-sqlite3-wasm driver is used instead.'
    )
  }
}
