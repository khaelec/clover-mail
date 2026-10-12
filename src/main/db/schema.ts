import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull()
})

export const migrationsTable = sqliteTable('__migrations', {
  id: text('id').primaryKey(),
  appliedAt: integer('applied_at').notNull()
})

export const schema = {
  appSettings,
  migrationsTable
}
