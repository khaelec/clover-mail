import type { ImapFlow } from 'imapflow'
import { and, eq } from 'drizzle-orm'
import { getDb } from '@core/db'
import { folders } from '@core/db/schema'
import { getAccountById, listAccounts, protocolFor } from './accounts'
import { buildAccountClient } from './auth'
import { syncFolder } from './sync'
import { logLine } from '@core/log'
import type { MailEvent } from '@shared/mail'

export type Emit = (event: MailEvent) => void

interface Handle {
  accountId: string
  client: ImapFlow | null
  stopped: boolean
  reconnect?: ReturnType<typeof setTimeout>
  /** Consecutive failed connects, for backoff. Reset once IDLE is running. */
  failures: number
  /** Bumped by every (re)connect; a loop from an older generation just exits. */
  generation: number
  /** Inbox sync running for this account, and whether another was requested meanwhile. */
  syncing: boolean
  syncAgain: boolean
}

const handles = new Map<string, Handle>()
let lastEmit: Emit | null = null

function errText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function connect(handle: Handle, emit: Emit): Promise<void> {
  if (handle.stopped) return
  if (!getAccountById(handle.accountId)) return
  const generation = ++handle.generation
  const current = (): boolean => !handle.stopped && handle.generation === generation

  let client: ImapFlow | null = null
  try {
    // Inside the try: building the client refreshes OAuth tokens, which fails
    // while the network is down (e.g. just after waking from sleep). Outside it,
    // that rejection was swallowed and IDLE for the account never came back.
    client = await buildAccountClient(handle.accountId, 'idle')
    if (!current()) return
    handle.client = client
    await client.connect()
    await client.mailboxOpen('INBOX')
    // New mail, but also read/star changes and deletions made on another
    // device: all re-sync the inbox so this window matches within seconds.
    for (const event of ['exists', 'flags', 'expunge']) {
      client.on(event, () => {
        void onNewMail(handle, emit)
      })
    }
    if (!current()) return
    handle.failures = 0
    // Catch up on anything that arrived while IDLE was down.
    void onNewMail(handle, emit)
    // Re-arm IDLE after every event (a new message ends IDLE); without this the
    // account stops receiving live updates after the first notification.
    while (current() && client.usable) {
      try {
        await client.idle()
      } catch {
        break
      }
    }
  } catch (error) {
    if (current()) {
      handle.failures += 1
      logLine(`idle:${handle.accountId}`, `connect failed: ${errText(error)}`)
    }
  } finally {
    if (client) {
      if (handle.client === client) handle.client = null
      await client.logout().catch(() => undefined)
    }
  }
  if (current()) reconnect(handle, emit)
}

async function onNewMail(handle: Handle, emit: Emit): Promise<void> {
  // A burst of EXISTS events would otherwise queue one inbox sync per message;
  // instead run one, then one more if anything arrived while it ran.
  if (handle.syncing) {
    handle.syncAgain = true
    return
  }
  const inbox = getDb()
    .select()
    .from(folders)
    .where(and(eq(folders.accountId, handle.accountId), eq(folders.specialUse, 'inbox')))
    .get()
  if (!inbox) return

  handle.syncing = true
  try {
    do {
      handle.syncAgain = false
      // syncFolder emits mail:new for newly-fetched inbox mail (and the native
      // notification) whenever any sync finds it, so IDLE just triggers the sync
      // and refreshes the list — no separate notification here, which also
      // avoids a duplicate when the periodic sync races with IDLE.
      try {
        await syncFolder(inbox.id, emit)
      } catch (error) {
        logLine(`idle:${handle.accountId}`, `inbox sync failed: ${errText(error)}`)
      }
    } while (handle.syncAgain && !handle.stopped)
  } finally {
    handle.syncing = false
  }
  emit({ type: 'mail:refresh', accountId: handle.accountId })
}

function reconnect(handle: Handle, emit: Emit): void {
  if (handle.stopped) return
  if (handle.reconnect) clearTimeout(handle.reconnect)
  // 15s, 30s, 60s … capped at 5 minutes, so an outage doesn't hammer the server
  // but recovery after a short blip is quick.
  const delay = Math.min(15_000 * 2 ** Math.max(0, handle.failures - 1), 5 * 60_000)
  handle.reconnect = setTimeout(() => {
    handle.reconnect = undefined
    void connect(handle, emit)
  }, delay)
}

export function startIdle(accountId: string, emit: Emit): void {
  lastEmit = emit
  if (handles.has(accountId)) return
  const handle: Handle = {
    accountId,
    client: null,
    stopped: false,
    failures: 0,
    generation: 0,
    syncing: false,
    syncAgain: false
  }
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

/**
 * Drop every IDLE connection and reconnect now. After sleep or a network change
 * the old sockets are dead but may not notice for minutes; this brings live
 * updates back immediately (and catches up on mail that arrived meanwhile).
 */
export function restartAllIdle(): void {
  const emit = lastEmit
  if (!emit) return
  for (const handle of handles.values()) {
    if (handle.stopped) continue
    if (handle.reconnect) clearTimeout(handle.reconnect)
    handle.reconnect = undefined
    handle.failures = 0
    const old = handle.client
    handle.client = null
    // connect() bumps the generation, so the old loop exits without reconnecting.
    void connect(handle, emit)
    try {
      old?.close()
    } catch {
      // already closed
    }
  }
}

export function stopAllIdle(): void {
  for (const id of [...handles.keys()]) stopIdle(id)
}
