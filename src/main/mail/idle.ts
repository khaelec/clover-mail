import type { ImapFlow } from 'imapflow'
import { and, eq } from 'drizzle-orm'
import { getDb } from '../db'
import { folders } from '../db/schema'
import { getAccountById, listAccounts, protocolFor } from './accounts'
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
    // Re-arm IDLE after every event (a new message ends IDLE); without this the
    // account stops receiving live updates after the first notification.
    while (!handle.stopped && client.usable) {
      try {
        await client.idle()
      } catch {
        break
      }
    }
    if (!handle.stopped) reconnect(handle, emit)
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
  if (!inbox) return

  // syncFolder now emits mail:new for newly-fetched inbox mail (and the native
  // notification) whenever any sync finds it, so IDLE just triggers the sync and
  // refreshes the list — no separate notification here, which also avoids a
  // duplicate when the periodic sync races with IDLE.
  try {
    await syncFolder(inbox.id, emit)
  } catch {
    // ignore; next event or manual sync will reconcile
  }
  emit({ type: 'mail:refresh', accountId: handle.accountId })
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
  for (const account of listAccounts()) {
    if (protocolFor(account.id) === 'imap') startIdle(account.id, emit)
  }
}

export function stopAllIdle(): void {
  for (const id of [...handles.keys()]) stopIdle(id)
}
