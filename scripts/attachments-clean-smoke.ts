// Attachment-cleanup smoke test: referenced files survive, orphans are removed,
// a dry run removes nothing, and nothing outside the attachments folder is
// touched. Uses a throwaway temp database/folder.
//
//   npx tsx scripts/attachments-clean-smoke.ts
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeDatabase, getDb, initDatabase } from '../src/main/db'
import { accounts, attachments, folders, messages } from '../src/main/db/schema'
import { cleanOrphanAttachments } from '../src/main/mail/attachmentsCleanup'

const dir = mkdtempSync(join(tmpdir(), 'clover-attach-'))
initDatabase(dir)
const db = getDb()

// Minimal account/folder/message so the attachment row's FK is satisfied.
db.insert(accounts)
  .values({ id: 'a1', email: 'a@test.local', isEnabled: true, createdAt: Date.now() })
  .run()
db.insert(folders).values({ id: 'f1', accountId: 'a1', remotePath: 'INBOX', name: 'Inbox' }).run()
db.insert(messages).values({ id: 'm1', accountId: 'a1', folderId: 'f1', uid: 1 }).run()
db.insert(attachments)
  .values({ id: 'att1', messageId: 'm1', filename: 'keep.txt', contentPath: join('m1', 'att1.txt') })
  .run()

const attachRoot = join(dir, 'attachments')
mkdirSync(join(attachRoot, 'm1'), { recursive: true })
writeFileSync(join(attachRoot, 'm1', 'att1.txt'), 'keep') // referenced -> survives
writeFileSync(join(attachRoot, 'm1', 'orphan.txt'), 'orphan') // orphan -> removed
const outside = join(dir, 'outside.txt')
writeFileSync(outside, 'outside')

const out: Record<string, boolean> = {}

const first = cleanOrphanAttachments(dir)
out.keepExists = existsSync(join(attachRoot, 'm1', 'att1.txt'))
out.orphanGone = !existsSync(join(attachRoot, 'm1', 'orphan.txt'))
out.outsideUntouched = existsSync(outside)
out.removedOne = first.removed === 1

// Dry run removes nothing.
writeFileSync(join(attachRoot, 'm1', 'orphan2.txt'), 'orphan2')
process.env.CLOVER_ATTACH_CLEAN_DRYRUN = '1'
const dry = cleanOrphanAttachments(dir)
delete process.env.CLOVER_ATTACH_CLEAN_DRYRUN
out.dryRunRemovedNothing = dry.removed === 0 && existsSync(join(attachRoot, 'm1', 'orphan2.txt'))

// Running for real now removes it.
const second = cleanOrphanAttachments(dir)
out.secondRunRemoved = second.removed === 1 && !existsSync(join(attachRoot, 'm1', 'orphan2.txt'))

closeDatabase()
console.log(JSON.stringify(out, null, 2))
const ok = Object.values(out).every(Boolean)
console.log(ok ? 'ATTACH_CLEAN_SMOKE_OK' : 'ATTACH_CLEAN_SMOKE_FAIL')
process.exit(ok ? 0 : 1)
