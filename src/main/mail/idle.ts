import type { ImapFlow } from 'imapflow'
import { and, eq } from 'drizzle-orm'
import { getDb } from '../db'
import { folders } from '../db/schema'
import { getAccountById, listAccounts } from './accounts'
import { buildAccountClient } from './auth'
import { syncFolder } from './sync'
import type { MailEvent } from '@shared/mail'

export type Emit = (event: MailEvent) => void

interface Handle {
  accountId: string
  client: ImapFlow | null
  stopped: boolean
  reconnect?: ReturnType<typeof setTimeout>
}

const handles = new Map<string, Handle>()

async function connect(handle: Handle, emit: Emit): Promise<void> {
  if (handle.stopped) return
  const account = getAccountById(handle.accountId)
  if (!account) return

  const client = await buildAccountClient(handle.accountId)
  handle.client = client
  client.on('error', () => undefined)

  try {
    await client.connect()
    await client.mailboxOpen('INBOX')
    client.on('exists', () => {
      void onNewMail(handle, emit)
    })
    if (handle.stopped) {
      await client.logout().catch(() => undefined)
      return
    }
    await client.idle()
  } catch {
    reconnect(handle, emit)
  }
}

async function onNewMail(handle: Handle, emit: Emit): Promise<void> {
  const inbox = getDb()
    .select()
    .from(folders)
    .where(and(eq(folders.accountId, handle.accountId), eq(folders.specialUse, 'inbox')))
    .get()
  if (inbox) {
    try {
      await syncFolder(inbox.id, emit)
    } catch {
      // ignore; next event or manual sync will reconcile
    }
  }
  emit({ type: 'mail:new', accountId: handle.accountId })
}

function reconnect(handle: Handle, emit: Emit): void {
  if (handle.stopped) return
  if (handle.reconnect) clearTimeout(handle.reconnect)
  handle.reconnect = setTimeout(() => void connect(handle, emit), 15000)
}

export function startIdle(accountId: string, emit: Emit): void {
  if (handles.has(accountId)) return
  const handle: Handle = { accountId, client: null, stopped: false }
  handles.set(accountId, handle)
  void connect(handle, emit)
}

export function stopIdle(accountId: string): void {
  const handle = handles.get(accountId)
  if (!handle) return
  handle.stopped = true
  if (handle.reconnect) clearTimeout(handle.reconnect)
  handle.client?.logout().catch(() => undefined)
  handles.delete(accountId)
}

export function startAllIdle(emit: Emit): void {
  for (const account of listAccounts()) startIdle(account.id, emit)
}

export function stopAllIdle(): void {
  for (const id of [...handles.keys()]) stopIdle(id)
}
