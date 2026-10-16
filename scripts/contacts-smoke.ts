// Smoke test for the address book: learning from mail, ranking, save/remove,
// vCard/CSV import, and recipient-field parsing. Uses a throwaway temp database.
//
//   npx tsx scripts/contacts-smoke.ts
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeDatabase, getDb, initDatabase } from '../src/core/db'
import { accounts, folders, messages } from '../src/core/db/schema'
import {
  importContacts,
  listContacts,
  listGroups,
  removeGroup,
  saveGroup,
  parseContactsCsv,
  parseVcards,
  recordRecipients,
  removeContact,
  saveContact,
  suggestContacts,
  toVcards
} from '../src/core/mail/contacts'
import { formatAddress, parseAddress, splitAddresses } from '../src/shared/addresses'

const dir = mkdtempSync(join(tmpdir(), 'clover-contacts-'))
initDatabase(dir)
const db = getDb()

const accountId = 'acc1'
db.insert(accounts)
  .values({ id: accountId, email: 'me@test.local', isEnabled: true, createdAt: Date.now() })
  .run()
for (const [id, path, specialUse] of [
  ['inbox', 'INBOX', 'inbox'],
  ['sent', 'Sent', 'sent'],
  ['junk', 'Junk', 'junk']
] as const) {
  db.insert(folders).values({ id, accountId, remotePath: path, name: path, specialUse }).run()
}

let uid = 1
function add(folderId: string, from: [string, string], to: [string, string][] = [], isSpam = false): void {
  const n = uid++
  db.insert(messages)
    .values({
      id: `${folderId}:${n}`,
      accountId,
      folderId,
      uid: n,
      fromName: from[0],
      fromEmail: from[1],
      toJson: JSON.stringify(to.map(([name, address]) => ({ name, address }))),
      isSpam,
      dateUtc: Date.now() - n * 1000
    })
    .run()
}

const out: Record<string, boolean> = {}

// Learned: two sends to Ann, one mail received from Andy, spam and no-reply ignored.
add('sent', ['Me', 'me@test.local'], [['Ann Lee', 'ann@corp.test']])
add('sent', ['Me', 'me@test.local'], [['Ann Lee', 'Ann@Corp.test']])
add('inbox', ['Andy Roe', 'andy@corp.test'], [['Me', 'me@test.local']])
add('inbox', ['Robot', 'no-reply@corp.test'])
add('junk', ['Spammer', 'anna@spam.test'])
add('inbox', ['Spammer', 'anne@spam.test'], [], true)

const an = suggestContacts('an')
out.learnsSentAndReceived = an.length === 2
out.sentRanksFirst = an[0]?.email === 'ann@corp.test' && an[1]?.email === 'andy@corp.test'
out.keepsName = an[0]?.name === 'Ann Lee'
out.skipsNoReplyAndSpam = suggestContacts('no-reply').length === 0 && suggestContacts('anna').length === 0 && suggestContacts('anne').length === 0
out.skipsOwnAddress = suggestContacts('me@').length === 0
out.matchesLastName = suggestContacts('lee')[0]?.email === 'ann@corp.test'
out.matchesDomain = suggestContacts('corp').length === 2
out.likeIsEscaped = suggestContacts('%').length === 0

// Incremental: a later message is learned on the next lookup, earlier ones not re-counted.
add('sent', ['Me', 'me@test.local'], [['Zed', 'zed@corp.test']])
const all = listContacts('all')
out.incremental = all.some((c) => c.email === 'zed@corp.test') && all.find((c) => c.email === 'ann@corp.test')?.sendCount === 2

// Address book: saved contacts are separate from learned ones and rank first.
out.savedEmpty = listContacts('saved').length === 0
const saved = saveContact({ email: 'Bob@Example.test', name: 'Bob Builder', company: 'ACME' })
out.saveLowercases = saved.email === 'bob@example.test' && saved.isSaved
out.savedListed = listContacts('saved').length === 1
out.savedRanksFirst = suggestContacts('b')[0]?.email === 'bob@example.test'
let rejected = false
try {
  saveContact({ email: 'not-an-address' })
} catch {
  rejected = true
}
out.rejectsInvalid = rejected

// Remove: gone from the book and autocomplete, and not re-learned from old mail.
const andy = listContacts('all').find((c) => c.email === 'andy@corp.test')
if (andy) removeContact(andy.id)
out.removed = suggestContacts('andy').length === 0 && !listContacts('all').some((c) => c.email === 'andy@corp.test')
// Sending to it again brings it back.
recordRecipients(['"Roe, Andy" <andy@corp.test>'])
out.sendUnhides = suggestContacts('andy').length === 1

// Import: vCard (folded line, two emails) and an Outlook-style CSV.
const vcf = 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Carol\r\n  King\r\nEMAIL;TYPE=WORK:carol@x.test\r\nEMAIL:ck@y.test\r\nORG:Tapestry;\r\nEND:VCARD\r\n'
const cards = parseVcards(vcf)
out.vcardParsed = cards.length === 2 && cards[0].name === 'Carol King' && cards[0].company === 'Tapestry'
const csv = 'First Name,Last Name,E-mail Address,Company,Mobile Phone\n"Dee","Dunn","dee@x.test","Dunn, Inc","555"\n,,bad,,\n'
const rows = parseContactsCsv(csv)
out.csvParsed = rows.length === 1 && rows[0].name === 'Dee Dunn' && rows[0].company === 'Dunn, Inc'
const result = importContacts([...cards, ...rows, { email: 'bob@example.test', name: '' }, { email: 'junk' }])
out.importCounts = result.imported === 3 && result.updated === 1 && result.skipped === 1
out.importKeepsDetails = listContacts('saved', 'bob')[0]?.name === 'Bob Builder'
out.vcardRoundTrip = parseVcards(toVcards(listContacts('saved'))).length === 4

// Groups: picking "Team" suggests the whole group; removed members drop out.
const book = listContacts('saved')
const bob = book.find((c) => c.email === 'bob@example.test')
const carol = book.find((c) => c.email === 'carol@x.test')
const team = saveGroup('  Sales   Team ', [bob?.id ?? '', carol?.id ?? '', 'missing-id'])
out.groupSaved = team.name === 'Sales Team' && team.members.length === 2
let dup = false
try {
  saveGroup('sales team', [])
} catch {
  dup = true
}
out.groupNameUnique = dup
const teamHit = suggestContacts('team')[0]
out.groupSuggested =
  teamHit?.group?.id === team.id &&
  teamHit.group.members.length === 2 &&
  teamHit.group.members.includes('Bob Builder <bob@example.test>')
out.groupSuggestedByFirstWord = suggestContacts('sal')[0]?.group?.id === team.id
saveGroup('Sales Team', [bob?.id ?? ''], team.id)
out.groupEdited = listGroups().find((g) => g.id === team.id)?.members.length === 1
if (bob) removeContact(bob.id)
out.removedMemberHidden = listGroups().find((g) => g.id === team.id)?.members.length === 0
out.emptyGroupNotSuggested = !suggestContacts('sales').some((s) => s.group)
removeGroup(team.id)
out.groupRemoved = listGroups().length === 0

// Recipient parsing (the old parser split "Ann Lee <ann@x>" into three).
const split = splitAddresses('Ann Lee <ann@x.test>, "Smith, Bob" <bob@y.test>; c@z.test d@z.test')
out.splitKeepsNames = split.length === 4 && split[0] === 'Ann Lee <ann@x.test>' && split[1] === '"Smith, Bob" <bob@y.test>'
out.parseAddress = parseAddress('"Smith, Bob" <bob@y.test>')?.name === 'Smith, Bob' && parseAddress('c@z.test')?.email === 'c@z.test'
out.formatQuotes = formatAddress('Smith, Bob', 'bob@y.test') === '"Smith, Bob" <bob@y.test>' && formatAddress(null, 'c@z.test') === 'c@z.test'

closeDatabase()
const failed = Object.entries(out).filter(([, ok]) => !ok)
console.log(JSON.stringify(out))
if (failed.length > 0) {
  console.log(`CONTACTS_SMOKE_FAIL ${failed.map(([k]) => k).join(', ')}`)
  process.exit(1)
}
console.log('CONTACTS_SMOKE_OK')
