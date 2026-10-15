// Smoke test for the Inbox new-mail announcement (0.4.59) and the bell store's
// de-duplication. Uses a throwaway temp database.
//
//   npx tsx scripts/announce-smoke.ts
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeDatabase, getDb, initDatabase } from '../src/main/db'
import { accounts, folders, messages } from '../src/main/db/schema'
import { announceNewInboxMessages } from '../src/main/mail/announce'
import { markRecentlyRestored } from '../src/core/mail/recentUids'
import { setThreadMuted } from '../src/main/mail/threadSettings'
import { useNotifications } from '../src/renderer/src/state/notifications'

const dir = mkdtempSync(join(tmpdir(), 'clover-announce-'))
initDatabase(dir)
const db = getDb()

const accountId = 'acc1'
const folderId = 'f1'
db.insert(accounts)
  .values({ id: accountId, email: 'me@test.local', isEnabled: true, createdAt: Date.now() })
  .run()
db.insert(folders)
  .values({ id: folderId, accountId, remotePath: 'INBOX', name: 'Inbox', specialUse: 'inbox' })
  .run()

function addMessage(
  uid: number,
  opts: { isRead?: boolean; isSpam?: boolean; threadId?: string | null; dateUtc?: number; from?: string; subject?: string } = {}
): void {
  db.insert(messages)
    .values({
      id: `${folderId}:${uid}`,
      accountId,
      folderId,
      uid,
      fromName: opts.from ?? `Sender ${uid}`,
      fromEmail: `${opts.from ?? `sender${uid}`}@test.local`,
      subject: opts.subject ?? `Subject ${uid}`,
      messageId: `<m${uid}@test>`,
      threadId: opts.threadId ?? null,
      isRead: opts.isRead ?? false,
      isSpam: opts.isSpam ?? false,
      dateUtc: opts.dateUtc ?? Date.now()
    })
    .run()
}

function run(): void {
  const out: Record<string, boolean> = {}

  // A) a message Undo just restored -> no event.
  addMessage(10)
  markRecentlyRestored(accountId, folderId, [10])
  out.restoredSuppressed = announceNewInboxMessages(accountId, folderId, [10]) === null

  // B) an already-read message -> no event.
  addMessage(11, { isRead: true })
  out.readSuppressed = announceNewInboxMessages(accountId, folderId, [11]) === null

  // C) two new unread messages -> one event, newest, summary text.
  addMessage(20, { dateUtc: 1_000, from: 'Older', subject: 'Older subject' })
  addMessage(21, { dateUtc: 2_000, from: 'Newer', subject: 'Newer subject' })
  const burst = announceNewInboxMessages(accountId, folderId, [20, 21])
  out.burstSummary =
    burst !== null &&
    burst.messageId === `${folderId}:21` &&
    burst.title === 'Newer' &&
    burst.body === 'and 1 more'

  // D) spam -> no event.
  addMessage(30, { isSpam: true })
  out.spamSuppressed = announceNewInboxMessages(accountId, folderId, [30]) === null

  // E) muted thread -> no event.
  addMessage(40, { threadId: 't-muted' })
  setThreadMuted('t-muted', true)
  out.mutedSuppressed = announceNewInboxMessages(accountId, folderId, [40]) === null

  // F) the store keeps one item per messageId.
  const store = useNotifications.getState()
  store.add({ kind: 'mail', title: 'New mail from A', body: 'x', messageId: 'm1' })
  useNotifications.getState().add({ kind: 'mail', title: 'New mail from A', body: 'x', messageId: 'm1' })
  out.storeDedupe = useNotifications.getState().items.length === 1

  closeDatabase()
  console.log(JSON.stringify(out, null, 2))
  const ok = Object.values(out).every(Boolean)
  console.log(ok ? 'ANNOUNCE_SMOKE_OK' : 'ANNOUNCE_SMOKE_FAIL')
  process.exit(ok ? 0 : 1)
}

run()
