import { buildAccountClient } from './auth'
import type { ImapFlow } from 'imapflow'

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
    if (!entry.client || !entry.client.usable) {
      entry.client = await buildAccountClient(accountId)
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
