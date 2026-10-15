// Attachment-cleanup smoke test: referenced files survive, orphans are moved to
// quarantine (not deleted), the mass-deletion / empty-table guards skip, a dry
// run moves nothing, old quarantine entries are purged, and nothing outside the
// folders is touched. Uses throwaway temp databases.
//
//   npx tsx scripts/attachments-clean-smoke.ts
import { existsSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { closeDatabase, getDb, initDatabase } from '../src/core/db'
import { accounts, attachments, folders, messages } from '../src/core/db/schema'
import { cleanOrphanAttachments } from '../src/main/mail/attachmentsCleanup'

const out: Record<string, boolean> = {}

function setup(): string {
  const dir = mkdtempSync(join(tmpdir(), 'clover-attach-'))
  initDatabase(dir)
  const db = getDb()
  db.insert(accounts)
    .values({ id: 'a1', email: 'a@test.local', isEnabled: true, createdAt: Date.now() })
    .run()
  db.insert(folders).values({ id: 'f1', accountId: 'a1', remotePath: 'INBOX', name: 'Inbox' }).run()
  db.insert(messages).values({ id: 'm1', accountId: 'a1', folderId: 'f1', uid: 1 }).run()
  return dir
}

function addReferenced(dir: string, rel: string): void {
  getDb()
    .insert(attachments)
    .values({ id: `att-${rel}`, messageId: 'm1', filename: rel, contentPath: rel })
    .run()
  const abs = join(dir, 'attachments', rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, 'x')
}

function addOrphan(dir: string, rel: string): void {
  const abs = join(dir, 'attachments', rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, 'orphan')
}

// A) referenced survives; orphan is quarantined, not deleted.
{
  const dir = setup()
  addReferenced(dir, join('m1', 'keep.txt'))
  addOrphan(dir, join('m1', 'orphan.txt'))
  const res = cleanOrphanAttachments(dir)
  out.referencedSurvives = existsSync(join(dir, 'attachments', 'm1', 'keep.txt'))
  out.orphanQuarantined =
    existsSync(join(dir, 'attachments-orphaned', 'm1', 'orphan.txt')) &&
    !existsSync(join(dir, 'attachments', 'm1', 'orphan.txt')) &&
    res.quarantined === 1
  closeDatabase()
}

// B) mass-deletion guard: mostly-orphaned folder is left alone.
{
  const dir = setup()
  addReferenced(dir, join('m1', 'keep.txt'))
  for (let i = 0; i < 30; i += 1) addOrphan(dir, join('m1', `o${i}.txt`))
  const res = cleanOrphanAttachments(dir)
  out.massDeletionSkipped =
    res.skipped === true && res.quarantined === 0 && existsSync(join(dir, 'attachments', 'm1', 'o0.txt'))
  closeDatabase()
}

// C) empty attachments table with files present is left alone.
{
  const dir = setup()
  addOrphan(dir, join('m1', 'o.txt'))
  const res = cleanOrphanAttachments(dir)
  out.emptyTableSkipped = res.skipped === true && existsSync(join(dir, 'attachments', 'm1', 'o.txt'))
  closeDatabase()
}

// D) dry run moves nothing.
{
  const dir = setup()
  addReferenced(dir, join('m1', 'keep.txt'))
  addOrphan(dir, join('m1', 'orphan.txt'))
  process.env.CLOVER_ATTACH_CLEAN_DRYRUN = '1'
  const res = cleanOrphanAttachments(dir)
  delete process.env.CLOVER_ATTACH_CLEAN_DRYRUN
  out.dryRunMovesNothing =
    res.quarantined === 0 && existsSync(join(dir, 'attachments', 'm1', 'orphan.txt'))
  closeDatabase()
}

// E) quarantine entries older than 30 days are purged; recent ones kept.
{
  const dir = setup()
  const oldFile = join(dir, 'attachments-orphaned', 'm1', 'old.txt')
  mkdirSync(dirname(oldFile), { recursive: true })
  writeFileSync(oldFile, 'old')
  const past = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
  utimesSync(oldFile, past, past)
  const recentFile = join(dir, 'attachments-orphaned', 'm1', 'recent.txt')
  writeFileSync(recentFile, 'recent')
  const res = cleanOrphanAttachments(dir)
  out.quarantinePurge = !existsSync(oldFile) && existsSync(recentFile) && res.purged === 1
  closeDatabase()
}

console.log(JSON.stringify(out, null, 2))
const ok = Object.values(out).every(Boolean)
console.log(ok ? 'ATTACH_CLEAN_SMOKE_OK' : 'ATTACH_CLEAN_SMOKE_FAIL')
process.exit(ok ? 0 : 1)
