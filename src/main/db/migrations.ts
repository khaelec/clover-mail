export interface Migration {
  id: string
  sql: string
}

/**
 * Ordered, idempotent migrations. Each entry is applied once and recorded in
 * __migrations. Keep statements idempotent (IF NOT EXISTS) so a partial run is
 * always safe to resume.
 */
export const migrations: Migration[] = [
  {
    id: '0000_init',
    sql: `
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `
  }
]
