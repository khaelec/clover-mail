import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeDatabase, getDb, initDatabase } from '../src/main/db'
import { accounts, folders, messages } from '../src/main/db/schema'
import { applyAssessment, markSpam } from '../src/main/mail/spam'

const dir = mkdtempSync(join(tmpdir(), 'clover-spam-'))
initDatabase(dir)
const db = getDb()

const accountId = 'acc1'
db.insert(accounts)
  .values({ id: accountId, email: 'me@test.local', displayName: 'Me', color: '#000', isEnabled: true, createdAt: Date.now() })
  .run()
db.insert(folders)
  .values({ id: 'f1', accountId, remotePath: 'INBOX', name: 'Inbox' })
  .run()

let uid = 0
function insert(id: string, from: string, subject: string, messageId: string | null): void {
  uid += 1
  db.insert(messages)
    .values({
      id,
      accountId,
      folderId: 'f1',
      uid,
      fromName: from.split('@')[0],
      fromEmail: from,
      subject,
      messageId,
      dateUtc: Date.now() - uid * 1000
    })
    .run()
}

insert('m1', 'deals@spam.example', 'CONGRATULATIONS YOU WON free money in our lottery', null)
const spamScore = applyAssessment('m1')

insert('m2', 'boss@work.example', 'Meeting notes for Thursday', '<a@work.example>')
insert('m3', 'boss@work.example', 'Re: Meeting notes for Thursday', '<b@work.example>')
const goodScore = applyAssessment('m3')

markSpam('m1')
insert('m4', 'promo@spam2.example', 'YOU WON free money lottery winner act now', null)
const trainedSpamScore = applyAssessment('m4')

console.log(JSON.stringify({ spamScore, goodScore, trainedSpamScore }))
closeDatabase()

const ok = spamScore >= 40 && goodScore < 30 && trainedSpamScore >= 40
console.log(ok ? 'SPAM_SMOKE_OK' : 'SPAM_SMOKE_WEAK')
process.exit(ok ? 0 : 1)
