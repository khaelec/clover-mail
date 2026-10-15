// Reconciliation smoke test with a fake IMAP client. Runs against a throwaway
// temp database (never the real profile), so it needs no server and no guard.
//
//   npx tsx scripts/reconcile-smoke.ts
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { closeDatabase, getDb, initDatabase } from '../src/main/db'
import { accounts, folders, messages } from '../src/main/db/schema'
import { reconcileMailbox, type ReconcileClient } from '../src/main/mail/reconcile'

const dir = mkdtempSync(join(tmpdir(), 'clover-reconcile-'))
initDatabase(dir)
const db = getDb()

let n = 0
function makeAccount(): string {
  n += 1
  const id = `acc${n}`
  db.insert(accounts)
    .values({ id, email: `${id}@test.local`, isEnabled: true, createdAt: Date.now() })
    .run()
  return id
}

function makeFolder(accountId: string): string {
  n += 1
  const id = `f${n}`
  db.insert(folders).values({ id, accountId, remotePath: `INBOX${n}`, name: `Folder ${n}` }).run()
  return id
}

function addMessage(accountId: string, folderId: string, uid: number): void {
  n += 1
  db.insert(messages)
    .values({
      id: `${folderId}:${uid}:${n}`,
      accountId,
      folderId,
      uid,
      messageId: `<m${uid}@test>`,
      dateUtc: Date.now()
    })
    .run()
}

function folderRow(folderId: string): typeof folders.$inferSelect {
  return db.select().from(folders).where(eq(folders.id, folderId)).get()!
}
function rowCount(folderId: string): number {
  return db.select().from(messages).where(eq(messages.folderId, folderId)).all().length
}
function hasUid(folderId: string, uid: number): boolean {
  return db.select().from(messages).where(eq(messages.folderId, folderId)).all().some((m) => m.uid === uid)
}

interface Fake extends ReconcileClient {
  calls: number
}
function fake(serverUids: number[], mode: 'ok' | 'throw' | 'false' = 'ok'): Fake {
  const client: Fake = {
    calls: 0,
    search: async () => {
      client.calls += 1
      if (mode === 'throw') throw new Error('boom')
      if (mode === 'false') return false
      return serverUids
    }
  }
  return client
}

async function run(): Promise<void> {
const out: Record<string, boolean> = {}

// A) normal deletion: uids 1..5 cached, server has 1,2,4,5 -> remove uid 3.
{
  const a = makeAccount()
  const f = makeFolder(a)
  for (const uid of [1, 2, 3, 4, 5]) addMessage(a, f, uid)
  const removed = await reconcileMailbox(fake([1, 2, 4, 5]), a, f, folderRow(f), 4, 6)
  out.normalDeletion = removed === 1 && !hasUid(f, 3) && hasUid(f, 4)
}

// B) search throws -> nothing deleted.
{
  const a = makeAccount()
  const f = makeFolder(a)
  for (const uid of [1, 2, 3]) addMessage(a, f, uid)
  const removed = await reconcileMailbox(fake([], 'throw'), a, f, folderRow(f), 2, 4)
  out.searchThrows = removed === 0 && rowCount(f) === 3
}

// C) search returns a non-array -> nothing deleted.
{
  const a = makeAccount()
  const f = makeFolder(a)
  for (const uid of [1, 2, 3]) addMessage(a, f, uid)
  const removed = await reconcileMailbox(fake([], 'false'), a, f, folderRow(f), 2, 4)
  out.searchFalse = removed === 0 && rowCount(f) === 3
}

// D) mass-deletion guard: 40 cached, server has 10 -> suspect first, then delete.
{
  const a = makeAccount()
  const f = makeFolder(a)
  for (let uid = 1; uid <= 40; uid += 1) addMessage(a, f, uid)
  const serverUids = Array.from({ length: 10 }, (_, i) => i + 1)
  const first = await reconcileMailbox(fake(serverUids), a, f, folderRow(f), 10, 41)
  const suspectSet = folderRow(f).reconcileSuspect === true && rowCount(f) === 40
  const second = await reconcileMailbox(fake(serverUids), a, f, folderRow(f), 10, 41)
  out.massDeletionGuard = first === 0 && suspectSet && second === 30 && rowCount(f) === 10
}

// E) negative-UID placeholders are never touched.
{
  const a = makeAccount()
  const f = makeFolder(a)
  addMessage(a, f, -1)
  addMessage(a, f, -2)
  addMessage(a, f, 1)
  addMessage(a, f, 2)
  const removed = await reconcileMailbox(fake([1, 2]), a, f, folderRow(f), 2, 3)
  out.placeholdersUntouched = removed === 0 && hasUid(f, -1) && hasUid(f, -2)
}

// F) skip check: unchanged counts -> no search at all.
{
  const a = makeAccount()
  const f = makeFolder(a)
  addMessage(a, f, 1)
  db.update(folders)
    .set({ lastMessages: 5, lastUidNext: 6 })
    .where(eq(folders.id, f))
    .run()
  const client = fake([1])
  const removed = await reconcileMailbox(client, a, f, folderRow(f), 5, 6)
  out.skipWhenUnchanged = removed === 0 && client.calls === 0
}

closeDatabase()

console.log(JSON.stringify(out, null, 2))
const ok = Object.values(out).every(Boolean)
console.log(ok ? 'RECONCILE_SMOKE_OK' : 'RECONCILE_SMOKE_FAIL')
process.exit(ok ? 0 : 1)
}

void run()
