import { eq } from 'drizzle-orm'
import { getDb } from '@core/db'
import { appSettings } from '@core/db/schema'
import type { SettingsRecord } from '@shared/ipc'

function parse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export function getAllSettings(): SettingsRecord {
  const rows = getDb().select().from(appSettings).all()
  const out: SettingsRecord = {}
  for (const row of rows) {
    out[row.key] = parse(row.value)
  }
  return out
}

export function getSetting<T = unknown>(key: string): T | undefined {
  const row = getDb()
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .get()
  return row ? (parse(row.value) as T) : undefined
}

export function setSetting(key: string, value: unknown): void {
  const serialized = JSON.stringify(value ?? null)
  getDb()
    .insert(appSettings)
    .values({ key, value: serialized, updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: serialized, updatedAt: Date.now() }
    })
    .run()
}

export function deleteSetting(key: string): void {
  getDb().delete(appSettings).where(eq(appSettings.key, key)).run()
}
