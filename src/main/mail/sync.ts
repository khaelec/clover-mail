import type { FetchMessageObject, ImapFlow } from 'imapflow'
import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { getDb } from '../db'
import { folders, messages } from '../db/schema'
import { getAccountById, getAccountPassword } from './accounts'
import { buildImapClient } from './imap'
import { indexMessage } from './search'
import { applyAssessment } from './spam'
import type { MailEvent, SyncResult } from '@shared/mail'

const INITIAL_FETCH = 60

export type Emit = (event: MailEvent) => void

interface MailboxRecord {
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
  return null
}

const ORDER: Record<string, number> = {
  inbox: 0,
  drafts: 1,
  sent: 2,
  archive: 3,
  junk: 4,
  trash: 5
}

function upsertFolders(accountId: string, list: MailboxRecord[]): string[] {
  const db = getDb()
  const ids: string[] = []

  for (const mailbox of list) {
    const existing = db
      .select()
      .from(folders)
      .where(and(eq(folders.accountId, accountId), eq(folders.remotePath, mailbox.path)))
      .get()

    const specialUse = normalizeSpecialUse(mailbox)
    const name = mailbox.name && mailbox.name !== 'INBOX' ? mailbox.name : mailbox.path
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

function upsertMessage(accountId: string, folderId: string, msg: FetchMessageObject): void {
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
    threadId: env.inReplyTo ?? env.messageId ?? id
  }

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
  remotePath: string
): Promise<number> {
  const db = getDb()
  const folderRow = db.select().from(folders).where(eq(folders.id, folderId)).get()
  if (!folderRow) return 0

  await client.mailboxOpen(remotePath, { readOnly: true })
  try {
    const status = await client.status(remotePath, {
      messages: true,
      unseen: true,
      uidNext: true,
      uidValidity: true
    })
    if (!status) {
      throw new Error(`Could not read mailbox status for ${remotePath}`)
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
    for await (const msg of client.fetch(
      range,
      {
        uid: true,
        envelope: true,
        flags: true,
        internalDate: true,
        size: true,
        bodyStructure: true
      },
      options
    )) {
      upsertMessage(accountId, folderId, msg)
      count += 1
    }

    db.update(folders)
      .set({ uidValidity, uidNext, unreadCount: unseen, totalCount: messagesCount })
      .where(eq(folders.id, folderId))
      .run()

    return count
  } finally {
    await client.mailboxClose().catch(() => undefined)
  }
}

export async function syncAccount(accountId: string, emit: Emit): Promise<SyncResult> {
  const account = getAccountById(accountId)
  if (!account) throw new Error('Account not found')
  const password = getAccountPassword(accountId)
  if (!password) throw new Error('No stored password for account')

  emit({ type: 'sync:start', accountId })
  const client = buildImapClient(account.incoming, password)
  await client.connect()

  try {
    const list = (await client.list()) as unknown as MailboxRecord[]
    const folderIds = upsertFolders(accountId, list)
    const db = getDb()
    let fetched = 0

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
        const count = await syncOneMailbox(client, accountId, folderId, folderRow.remotePath)
        fetched += count
        emit({
          type: 'sync:progress',
          accountId,
          folderId,
          folderName: folderRow.name,
          fetched: count
        })
      } catch (error) {
        emit({
          type: 'sync:error',
          accountId,
          folderId,
          folderName: folderRow.name,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    emit({ type: 'sync:done', accountId, fetched })
    return { folders: folderIds.length, fetched }
  } finally {
    await client.logout().catch(() => undefined)
  }
}

export async function syncFolder(folderId: string, emit: Emit): Promise<SyncResult> {
  const db = getDb()
  const folderRow = db.select().from(folders).where(eq(folders.id, folderId)).get()
  if (!folderRow) throw new Error('Folder not found')
  const account = getAccountById(folderRow.accountId)
  if (!account) throw new Error('Account not found')
  const password = getAccountPassword(folderRow.accountId)
  if (!password) throw new Error('No stored password for account')

  const client = buildImapClient(account.incoming, password)
  await client.connect()
  try {
    const count = await syncOneMailbox(client, folderRow.accountId, folderId, folderRow.remotePath)
    emit({ type: 'sync:done', accountId: folderRow.accountId, fetched: count })
    return { folders: 1, fetched: count }
  } finally {
    await client.logout().catch(() => undefined)
  }
}
