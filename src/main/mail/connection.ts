import type { ImapFlow } from 'imapflow'
import { getAccountById, getAccountPassword } from './accounts'
import { buildImapClient } from './imap'

interface Entry {
  client: ImapFlow | null
  chain: Promise<unknown>
}

const pool = new Map<string, Entry>()

/**
 * Run an operation against a persistent, reused IMAP connection for the account.
 * Reusing the login removes the per-message connect/auth round-trips that made
 * opening messages slow. Operations on one account are serialized.
 */
export function withImap<T>(accountId: string, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const entry = pool.get(accountId) ?? { client: null, chain: Promise.resolve() }
  pool.set(accountId, entry)

  const run = entry.chain.then(async () => {
    const account = getAccountById(accountId)
    if (!account) throw new Error('Account not found')
    const password = getAccountPassword(accountId)
    if (!password) throw new Error('No stored password for account')

    if (!entry.client || !entry.client.usable) {
      entry.client = buildImapClient(account.incoming, password)
      await entry.client.connect()
    }
    try {
      return await fn(entry.client)
    } catch (error) {
      try {
        entry.client.close()
      } catch {
        // ignore
      }
      entry.client = null
      throw error
    }
  })

  entry.chain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

export function resetAccountConnection(accountId: string): void {
  const entry = pool.get(accountId)
  if (entry?.client) {
    try {
      entry.client.close()
    } catch {
      // ignore
    }
  }
  pool.delete(accountId)
}
