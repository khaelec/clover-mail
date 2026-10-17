// Search filters: the form round-trips through the search string, dates are
// local days with both ends included, and every filter must match (AND).
// Uses a throwaway database.
//
//   npx tsx scripts/search-smoke.ts
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeDatabase, getDb, initDatabase } from '../src/core/db'
import { accounts, folders, messages } from '../src/core/db/schema'
import { searchMessages } from '../src/core/mail/search'
import { fieldsToSearch, searchToFields, type SearchFields } from '../src/shared/search'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

const fields: SearchFields = {
  keywords: '',
  from: 'Ann Lee',
  to: '',
  subject: 'budget',
  folder: 'Inbox',
  fromDate: '2026-10-01',
  toDate: '2026-10-16',
  hasAttachment: true,
  unread: true,
  flagged: false
}
const query = fieldsToSearch(fields)
assert(
  query === 'from:"Ann Lee" subject:budget in:Inbox after:2026-10-01 before:2026-10-17 has:attachment is:unread',
  `unexpected search string: ${query}`
)
const back = searchToFields(query)
assert(JSON.stringify(back) === JSON.stringify(fields), `round trip changed the form: ${JSON.stringify(back)}`)

initDatabase(mkdtempSync(join(tmpdir(), 'clover-search-')))
const db = getDb()
db.insert(accounts).values({ id: 'a', email: 'me@test.local', isEnabled: true, createdAt: Date.now() }).run()
db.insert(folders).values({ id: 'inbox', accountId: 'a', remotePath: 'INBOX', name: 'Inbox', specialUse: 'inbox' }).run()
let uid = 1
function add(fromName: string, subject: string, day: number, extra: Partial<typeof messages.$inferInsert> = {}): void {
  const n = uid++
  db.insert(messages)
    .values({
      id: `inbox:${n}`,
      accountId: 'a',
      folderId: 'inbox',
      uid: n,
      subject,
      fromName,
      fromEmail: `${fromName.split(' ')[0].toLowerCase()}@x.test`,
      dateUtc: new Date(2026, 9, day, 12).getTime(),
      isRead: false,
      hasAttachments: true,
      ...extra
    })
    .run()
}
add('Ann Lee', 'Q4 budget', 16) // matches (last day included)
add('Ann Lee', 'Q4 budget', 17) // after the range
add('Ann Lee', 'Lunch', 10) // wrong subject
add('Bob Ray', 'Budget review', 10) // wrong sender
add('Ann Lee', 'Budget draft', 1) // first day included
add('Ann Lee', 'Budget read', 5, { isRead: true }) // already read
const hits = searchMessages(query, 'a').map((m) => m.subject)
assert(
  JSON.stringify(hits.sort()) === JSON.stringify(['Budget draft', 'Q4 budget']),
  `wrong results: ${JSON.stringify(hits)}`
)
closeDatabase()
console.log('SEARCH_SMOKE_OK')
