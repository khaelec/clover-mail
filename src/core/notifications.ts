import { desc } from 'drizzle-orm'
import { getDb } from '@core/db'
import { notifications } from '@core/db/schema'
import type { StoredNotification } from '@shared/notifications'

const MAX = 50

/** The persisted bell items, newest first. */
export function listNotifications(): StoredNotification[] {
  return getDb()
    .select()
    .from(notifications)
    .orderBy(desc(notifications.at))
    .limit(MAX)
    .all()
    .map((row) => ({
      id: row.id,
      kind: row.kind as StoredNotification['kind'],
      title: row.title,
      body: row.body,
      at: row.at,
      read: row.read,
      accountId: row.accountId ?? undefined,
      messageId: row.messageId ?? undefined,
      threadId: row.threadId ?? undefined,
      appId: row.appId ?? undefined,
      appName: row.appName ?? undefined,
      appNotifId: row.appNotifId ?? undefined,
      count: row.count
    }))
}

/** Replace the stored bell items with the current set. */
export function saveNotifications(items: StoredNotification[]): void {
  const db = getDb()
  db.transaction((tx) => {
    tx.delete(notifications).run()
    for (const n of items.slice(0, MAX)) {
      tx.insert(notifications)
        .values({
          id: n.id,
          kind: n.kind,
          title: n.title,
          body: n.body ?? '',
          at: n.at,
          read: n.read,
          accountId: n.accountId ?? null,
          messageId: n.messageId ?? null,
          threadId: n.threadId ?? null,
          appId: n.appId ?? null,
          appName: n.appName ?? null,
          appNotifId: n.appNotifId ?? null,
          count: n.count ?? 1
        })
        .run()
    }
  })
}
