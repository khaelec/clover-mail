// Notifications persistence + message-status smoke test.
//
//   npx tsx scripts/notifications-smoke.ts
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeDatabase, getDb, initDatabase } from '../src/core/db'
import { accounts, folders, messages } from '../src/core/db/schema'
import { listNotifications, saveNotifications } from '../src/core/notifications'
import { messageStatuses } from '../src/core/mail/queries'
import type { StoredNotification } from '../src/shared/notifications'

const dir = mkdtempSync(join(tmpdir(), 'clover-notif-'))
initDatabase(dir)
const db = getDb()

const out: Record<string, boolean> = {}

// Persistence round-trip.
const items: StoredNotification[] = [
  { id: 'n1', kind: 'mail', title: 'New mail from Alice', body: 'Hi', at: 2, read: false, accountId: 'a1', messageId: 'f1:1', threadId: 't1' },
  { id: 'n2', kind: 'app', title: 'WhatsApp', body: '', at: 1, read: true, appId: 'app1', appName: 'WhatsApp', count: 3 }
]
saveNotifications(items)
const loaded = listNotifications()
out.persists = loaded.length === 2 && loaded[0].id === 'n1' && loaded[0].messageId === 'f1:1'
out.keepsAppFields = loaded[1].appName === 'WhatsApp' && loaded[1].count === 3

// Replacing the set.
saveNotifications([items[0]])
out.replaces = listNotifications().length === 1

// Message status (drives the bell reconcile).
db.insert(accounts).values({ id: 'a1', email: 'a@t', isEnabled: true, createdAt: Date.now() }).run()
db.insert(folders).values({ id: 'f1', accountId: 'a1', remotePath: 'INBOX', name: 'Inbox' }).run()
db.insert(messages).values({ id: 'f1:1', accountId: 'a1', folderId: 'f1', uid: 1, isRead: true }).run()
const status = messageStatuses(['f1:1', 'f1:2'])
out.readReported = status['f1:1'].exists === true && status['f1:1'].isRead === true
out.missingReported = status['f1:2'].exists === false

closeDatabase()
console.log(JSON.stringify(out, null, 2))
const ok = Object.values(out).every(Boolean)
console.log(ok ? 'NOTIFICATIONS_SMOKE_OK' : 'NOTIFICATIONS_SMOKE_FAIL')
process.exit(ok ? 0 : 1)
