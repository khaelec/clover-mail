import type { FetchMessageObject, ImapFlow } from 'imapflow'
import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { getDb } from '../db'
import { folders, messages } from '../db/schema'
import { getAccountById, protocolFor } from './accounts'
import { buildAccountClient } from './auth'
import { withImap } from './connection'
import { fetchPop3 } from './pop3'
import { indexMessage } from './search'
import { reconcileMailbox, type ReconcileStatus } from './reconcile'
import { announceNewInboxMessages } from './announce'
import { isRecentlyRemoved } from './recentUids'
import { logError, logLine } from '../log'
import { clearSentPlaceholder } from './storeMessage'
import { applyAssessment } from './spam'
import { applyRules } from './rules'
import { inferSpecialUse, SPECIAL_USE_ORDER } from './specialUse'
import type { MailEvent, SyncResult } from '@shared/mail'

const INITIAL_FETCH = 60

function errText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const FETCH_FIELDS = {
  uid: true,
  envelope: true,
  flags: true,
  internalDate: true,
  size: true,
  bodyStructure: true
}

export type Emit = (event: MailEvent) => void

export interface MailboxRecord {
  path: string
  name?: string
  delimiter?: string
  flags?: Set<string>
  specialUse?: string
  subscribed?: boolean
}

interface EnvelopeAddress {
  name?: string
  address?: string
}

interface EnvelopeLike {
  subject?: string
  messageId?: string
  inReplyTo?: string
  date?: Date
  from?: EnvelopeAddress[]
  to?: EnvelopeAddress[]
  cc?: EnvelopeAddress[]
  bcc?: EnvelopeAddress[]
  replyTo?: EnvelopeAddress[]
}

function normalizeSpecialUse(mailbox: MailboxRecord): string | null {
  const raw = (mailbox.specialUse ?? '').replace(/\\/g, '').toLowerCase()
  if (raw) return raw
  const flags = mailbox.flags ? [...mailbox.flags].map((f) => f.replace(/\\/g, '').toLowerCase()) : []
  for (const flag of flags) {
    if (['inbox', 'sent', 'drafts', 'trash', 'junk', 'archive', 'all'].includes(flag)) return flag
  }
  if (mailbox.path.toUpperCase() === 'INBOX') return 'inbox'
  return inferSpecialUse(mailbox.path, mailbox.name)
}

const ORDER = SPECIAL_USE_ORDER

export function upsertFolders(accountId: string, list: MailboxRecord[]): string[] {
  const db = getDb()
  const ids: string[] = []

  for (const mailbox of list) {
    const flags = mailbox.flags
      ? [...mailbox.flags].map((f) => f.replace(/\\/g, '').toLowerCase())
      : []
    // Skip containers like Gmail's "[Gmail]" namespace (not real folders).
    if (flags.includes('noselect')) continue

    const existing = db
      .select()
      .from(folders)
      .where(and(eq(folders.accountId, accountId), eq(folders.remotePath, mailbox.path)))
      .get()

    const specialUse = normalizeSpecialUse(mailbox)
    const rawName = mailbox.name && mailbox.name !== 'INBOX' ? mailbox.name : mailbox.path
    const name = rawName.replace(/^\[Gmail\]\//i, '')
    const sortOrder = specialUse ? (ORDER[specialUse] ?? 50) : 100

    if (existing) {
      db.update(folders)
        .set({
          name,
          specialUse,
          delimiter: mailbox.delimiter ?? null,
          isSubscribed: mailbox.subscribed ?? true,
          sortOrder
        })
        .where(eq(folders.id, existing.id))
        .run()
      ids.push(existing.id)
    } else {
      const id = randomUUID()
      db.insert(folders)
        .values({
          id,
          accountId,
          remotePath: mailbox.path,
          name,
          specialUse,
          delimiter: mailbox.delimiter ?? null,
          isSubscribed: mailbox.subscribed ?? true,
          sortOrder
        })
        .run()
      ids.push(id)
    }
  }

  // Drop folders the server no longer lists (and their cached messages).
  const currentPaths = new Set(ids.map((id) => db.select().from(folders).where(eq(folders.id, id)).get()?.remotePath))
  for (const folder of db.select().from(folders).where(eq(folders.accountId, accountId)).all()) {
    if (!currentPaths.has(folder.remotePath)) {
      db.delete(messages).where(eq(messages.folderId, folder.id)).run()
      db.delete(folders).where(eq(folders.id, folder.id)).run()
    }
  }

  return ids
}

function toAddressJson(list?: EnvelopeAddress[]): string | null {
  if (!list || list.length === 0) return null
  return JSON.stringify(list.map((a) => ({ name: a.name ?? null, address: a.address ?? null })))
}

function hasAttachment(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false
  const obj = node as {
    disposition?: string
    dispositionParameters?: { filename?: string }
    childNodes?: unknown[]
  }
  if (obj.disposition === 'attachment') return true
  if (obj.disposition === 'inline' && obj.dispositionParameters?.filename) return true
  if (Array.isArray(obj.childNodes)) return obj.childNodes.some(hasAttachment)
  return false
}

function resolveThreadId(
  accountId: string,
  id: string,
  messageId: string | null,
  inReplyTo: string | null
): string {
  if (inReplyTo) {
    const parent = getDb()
      .select()
      .from(messages)
      .where(and(eq(messages.accountId, accountId), eq(messages.messageId, inReplyTo)))
      .get()
    if (parent?.threadId) return parent.threadId
    return inReplyTo
  }
  return messageId ?? id
}

export function upsertMessage(accountId: string, folderId: string, msg: FetchMessageObject): void {
  const db = getDb()
  const uid = msg.uid
  const id = `${folderId}:${uid}`
  const env = (msg.envelope ?? {}) as EnvelopeLike
  const from = env.from?.[0]
  const flags = msg.flags ?? new Set<string>()

  const base = {
    accountId,
    folderId,
    uid,
    messageId: env.messageId ?? null,
    inReplyTo: env.inReplyTo ?? null,
    refs: null,
    subject: env.subject ?? null,
    fromName: from?.name ?? null,
    fromEmail: from?.address ?? null,
    toJson: toAddressJson(env.to),
    ccJson: toAddressJson(env.cc),
    bccJson: toAddressJson(env.bcc),
    replyToJson: toAddressJson(env.replyTo),
    dateUtc: env.date ? new Date(env.date).getTime() : null,
    internalDate: msg.internalDate ? new Date(msg.internalDate).getTime() : null,
    size: typeof msg.size === 'number' ? msg.size : null,
    isRead: flags.has('\\Seen'),
    isFlagged: flags.has('\\Flagged'),
    isAnswered: flags.has('\\Answered'),
    isDraft: flags.has('\\Draft'),
    hasAttachments: hasAttachment(msg.bodyStructure),
    threadId: resolveThreadId(accountId, id, env.messageId ?? null, env.inReplyTo ?? null)
  }

  // Drop a locally cached sent copy (negative placeholder UID) once the real
  // message arrives from the server, so it isn't listed twice.
  if (base.messageId) clearSentPlaceholder(accountId, folderId, base.messageId)

  db.insert(messages)
    .values({ id, ...base })
    .onConflictDoUpdate({
      target: [messages.accountId, messages.folderId, messages.uid],
      set: base
    })
    .run()

  indexMessage(id)
  applyAssessment(id)
}

async function syncOneMailbox(
  client: ImapFlow,
  accountId: string,
  folderId: string,
  remotePath: string,
  emit: Emit
): Promise<number> {
  const db = getDb()
  const folderRow = db.select().from(folders).where(eq(folders.id, folderId)).get()
  if (!folderRow) return 0

  try {
    await client.mailboxOpen(remotePath, { readOnly: true })
  } catch (error) {
    throw new Error(`open: ${errText(error)}`)
  }
  try {
    const status = await client
      .status(remotePath, {
        messages: true,
        unseen: true,
        uidNext: true,
        uidValidity: true
      })
      .catch((error: unknown) => {
        throw new Error(`open: ${errText(error)}`)
      })
    if (!status) {
      throw new Error(`open: could not read mailbox status for ${remotePath}`)
    }

    const uidValidity = Number(status.uidValidity)
    const uidNext = Number(status.uidNext)
    const messagesCount = Number(status.messages ?? 0)
    const unseen = Number(status.unseen ?? 0)

    const reset = folderRow.uidValidity === null || folderRow.uidValidity !== uidValidity
    if (reset) {
      db.delete(messages)
        .where(and(eq(messages.accountId, accountId), eq(messages.folderId, folderId)))
        .run()
    }

    let range: string
    let options: { uid?: boolean }
    if (reset || folderRow.uidNext === null) {
      const start = Math.max(1, messagesCount - INITIAL_FETCH + 1)
      range = `${start}:*`
      options = {}
    } else {
      range = `${folderRow.uidNext}:*`
      options = { uid: true }
    }

    let count = 0
    const insertedUids: number[] = []
    try {
      for await (const msg of client.fetch(range, FETCH_FIELDS, options)) {
        upsertMessage(accountId, folderId, msg)
        insertedUids.push(msg.uid)
        count += 1
      }
    } catch (error) {
      throw new Error(`fetch: ${errText(error)}`)
    }

    // Announce the messages *this sync* inserted into the Inbox (not just IDLE,
    // and not "whatever is at the top"). Incremental fetches only, so a
    // first/backfill sync doesn't flood the bell. announceNewInboxMessages skips
    // read/spam/muted mail and messages Undo just restored.
    if (!reset && folderRow.uidNext !== null && folderRow.specialUse === 'inbox') {
      const event = announceNewInboxMessages(accountId, folderId, insertedUids)
      if (event) emit(event)
    }

    // Remove messages deleted on the server by another client. Skipped on a
    // UIDVALIDITY reset (the folder was just wiped and re-fetched).
    let reconcile: ReconcileStatus = 'skipped'
    let gaps: number[] = []
    if (!reset) {
      const result = await reconcileMailbox(client, accountId, folderId, folderRow, messagesCount, uidNext)
      reconcile = result.status
      gaps = result.gaps
    }

    // Refill server messages the cache is missing — fills gaps left by a fetch
    // that failed partway and repairs an accidental removal. Skip UIDs Clover
    // just deleted locally (the server may not have processed it yet).
    if (reconcile === 'ok' && gaps.length > 0) {
      const wanted = gaps.filter((uid) => !isRecentlyRemoved(accountId, folderId, uid))
      if (wanted.length > 0) {
        try {
          for await (const msg of client.fetch(wanted, FETCH_FIELDS, { uid: true })) {
            upsertMessage(accountId, folderId, msg)
          }
          logLine(`sync:${accountId}`, `refilled ${wanted.length} in ${folderRow.remotePath}`)
        } catch (error) {
          logLine(`sync:${accountId}`, `refill failed in ${folderRow.remotePath}: ${errText(error)}`)
        }
      }
    }

    // Only record the seen counts when the check actually ran. On 'failed' /
    // 'suspect' / 'dryrun' leave them, so the next sync checks again instead of
    // skipping and stranding ghosts.
    if (reset || reconcile === 'ok' || reconcile === 'skipped') {
      db.update(folders)
        .set({
          uidValidity,
          uidNext,
          unreadCount: unseen,
          totalCount: messagesCount,
          lastMessages: messagesCount,
          lastUidNext: uidNext
        })
        .where(eq(folders.id, folderId))
        .run()
    } else {
      db.update(folders)
        .set({ uidValidity, uidNext, unreadCount: unseen, totalCount: messagesCount })
        .where(eq(folders.id, folderId))
        .run()
    }

    return count
  } finally {
    await client.mailboxClose().catch(() => undefined)
  }
}

// Syncs currently running, keyed by account. Focus events, the interval timer and
// manual triggers can all fire at once; without this guard each would open its own
// IMAP connection (risking server connection limits and racing inserts) and POP3
// would download the same mail twice.
//
// A second trigger *joins* the running promise rather than getting a fake empty
// result: that way a manual refresh still resolves (or rejects) with the real
// outcome, so a failed connect surfaces its error instead of leaving the UI stuck
// on "Connecting…".
const inFlight = new Map<string, Promise<SyncResult>>()

export function isAccountSyncing(accountId: string): boolean {
  return inFlight.has(accountId)
}

export function syncAccount(accountId: string, emit: Emit): Promise<SyncResult> {
  const running = inFlight.get(accountId)
  if (running) return running
  const promise = runSyncAccount(accountId, emit)
    .catch((error: unknown) => {
      // Account-level failure (bad password, network drop, connect refused). Emit
      // it so the per-account status can show an error; the caller still sees the
      // rejection. This carries no folderId, unlike the per-folder sync:error.
      const message = errText(error)
      logError(`sync:${accountId}`, message)
      emit({ type: 'sync:error', accountId, error: message })
      throw error
    })
    .finally(() => inFlight.delete(accountId))
  inFlight.set(accountId, promise)
  return promise
}

async function runSyncAccount(accountId: string, emit: Emit): Promise<SyncResult> {
  const protocol = protocolFor(accountId)
  if (protocol === 'local') {
    emit({ type: 'sync:done', accountId, fetched: 0 })
    return { folders: 0, fetched: 0 }
  }
  if (protocol === 'pop3') {
    return fetchPop3(accountId, emit)
  }

  const account = getAccountById(accountId)
  if (!account) throw new Error('Account not found')

  emit({ type: 'sync:start', accountId })
  const client = await buildAccountClient(accountId)
  try {
    await client.connect()
  } catch (error) {
    throw new Error(`connect: ${errText(error)}`)
  }

  const db = getDb()
  let folderIds: string[] = []
  let fetched = 0

  try {
    let list: MailboxRecord[]
    try {
      list = (await client.list()) as unknown as MailboxRecord[]
    } catch (error) {
      throw new Error(`list: ${errText(error)}`)
    }
    folderIds = upsertFolders(accountId, list)

    for (const folderId of folderIds) {
      const folderRow = db.select().from(folders).where(eq(folders.id, folderId)).get()
      if (!folderRow) continue
      emit({
        type: 'sync:folder',
        accountId,
        folderId,
        folderName: folderRow.name
      })
      try {
        const count = await syncOneMailbox(client, accountId, folderId, folderRow.remotePath, emit)
        fetched += count
        emit({
          type: 'sync:progress',
          accountId,
          folderId,
          folderName: folderRow.name,
          fetched: count
        })
      } catch (error) {
        const message = errText(error)
        logLine(`sync:${accountId}`, `${folderRow.name}: ${message}`)
        emit({
          type: 'sync:error',
          accountId,
          folderId,
          folderName: folderRow.name,
          error: message
        })
      }
    }

  } finally {
    await client.logout().catch(() => undefined)
  }

  let targetFolderIds: string[] = []
  try {
    const result = await applyRules(accountId)
    targetFolderIds = result.targetFolderIds
  } catch {
    // Rule failures must not fail the sync itself.
  }

  if (targetFolderIds.length > 0) {
    const resyncClient = await buildAccountClient(accountId)
    await resyncClient.connect()
    try {
      for (const id of targetFolderIds) {
        const target = getDb().select().from(folders).where(eq(folders.id, id)).get()
        if (target) await syncOneMailbox(resyncClient, accountId, id, target.remotePath, emit)
      }
    } catch {
      // Best-effort; the next sync will reconcile.
    } finally {
      await resyncClient.logout().catch(() => undefined)
    }
  }

  emit({ type: 'sync:done', accountId, fetched })
  return { folders: folderIds.length, fetched }
}

export async function syncFolder(folderId: string, emit: Emit): Promise<SyncResult> {
  const db = getDb()
  const folderRow = db.select().from(folders).where(eq(folders.id, folderId)).get()
  if (!folderRow) throw new Error('Folder not found')

  if (protocolFor(folderRow.accountId) !== 'imap') {
    emit({ type: 'sync:done', accountId: folderRow.accountId, fetched: 0 })
    return { folders: 1, fetched: 0 }
  }

  // Don't open a second connection to a folder while a full sync of this account
  // is already walking it — wait for that to finish first.
  const running = inFlight.get(folderRow.accountId)
  if (running) await running.catch(() => undefined)

  // Reuse the shared per-account connection instead of logging in again.
  const count = await withImap(folderRow.accountId, (client) =>
    syncOneMailbox(client, folderRow.accountId, folderId, folderRow.remotePath, emit)
  )
  emit({ type: 'sync:done', accountId: folderRow.accountId, fetched: count })
  return { folders: 1, fetched: count }
}
