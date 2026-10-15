// Thread de-duplication smoke test.
//
//   npx tsx scripts/thread-dedupe-smoke.ts
//
// Gmail files one message into several folders (INBOX + All Mail + Important) as
// separate rows with the same Message-ID. The conversation list must show it once.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeDatabase, getDb, initDatabase } from '../src/core/db'
import { accounts, folders, messages } from '../src/core/db/schema'
import { listThreads, threadMessageIds } from '../src/core/mail/queries'

const dir = mkdtempSync(join(tmpdir(), 'clover-threads-'))
initDatabase(dir)
const db = getDb()

const now = Date.now()
db.insert(accounts).values({ id: 'a1', email: 'me@t', createdAt: now }).run()
const folder = (id: string, name: string, remotePath: string, specialUse: string | null): void => {
  db.insert(folders).values({ id, accountId: 'a1', name, remotePath, specialUse }).run()
}
folder('inbox', 'Inbox', 'INBOX', 'inbox')
folder('all', 'All Mail', '[Gmail]/All Mail', 'archive')
folder('imp', 'Important', '[Gmail]/Important', null)
folder('trash', 'Trash', '[Gmail]/Trash', 'trash')

const msg = (
  id: string,
  folderId: string,
  uid: number,
  messageId: string | null,
  subject: string,
  date: number,
  isRead = false
): void => {
  db.insert(messages)
    .values({ id, accountId: 'a1', folderId, uid, messageId, subject, dateUtc: date, isRead })
    .run()
}

// MID-1: the same email filed in Inbox, All Mail and Important (unread in Inbox).
msg('m1', 'inbox', 1, 'MID-1', 'Quote', 100, false)
msg('m2', 'all', 1, 'MID-1', 'Quote', 100, true)
msg('m3', 'imp', 1, 'MID-1', 'Quote', 100, true)
// MID-2: Inbox + a Trash copy.
msg('m4', 'inbox', 2, 'MID-2', 'Hello', 200, false)
msg('m5', 'trash', 1, 'MID-2', 'Hello', 200, false)
// A message with no Message-ID must stay on its own.
msg('m6', 'inbox', 3, null, 'NoId', 50)

const out: Record<string, boolean> = {}

const inbox = listThreads('inbox')
const quote = inbox.find((t) => t.subject === 'Quote')
const hello = inbox.find((t) => t.subject === 'Hello')

out.inboxCountsOnce = quote?.messageCount === 1 && quote.unreadCount === 1
out.inboxUsesInboxCopy = quote?.messages[0]?.id === 'm1'
out.inboxDropsTrash = hello?.messageCount === 1 && hello.messages[0]?.id === 'm4'
out.inboxKeepsNoId = inbox.some((t) => t.subject === 'NoId' && t.messageCount === 1)

const all = listThreads('all')
const quoteAll = all.find((t) => t.subject === 'Quote')
out.allMailUsesAllCopy = quoteAll?.messageCount === 1 && quoteAll.messages[0]?.id === 'm2'
out.allMailHidesInboxOnly = !all.some((t) => t.subject === 'Hello' || t.subject === 'NoId')

const trash = listThreads('trash')
const helloTrash = trash.find((t) => t.subject === 'Hello')
out.trashShowsTrashCopy = helloTrash?.messageCount === 1 && helloTrash.messages[0]?.id === 'm5'
out.trashOnly = trash.length === 1

out.readerMatchesList = JSON.stringify(threadMessageIds('m1')) === JSON.stringify(['m1'])

closeDatabase()
console.log(JSON.stringify(out, null, 2))
const ok = Object.values(out).every(Boolean)
console.log(ok ? 'THREAD_DEDUPE_SMOKE_OK' : 'THREAD_DEDUPE_SMOKE_FAIL')
process.exit(ok ? 0 : 1)
