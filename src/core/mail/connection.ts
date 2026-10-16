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
export function withImap<T>(
  accountId: string,
  fn: (client: ImapFlow) => Promise<T>,
  options: { retryOnDrop?: boolean } = {}
): Promise<T> {
  const entry = pool.get(accountId) ?? { client: null, chain: Promise.resolve() }
  pool.set(accountId, entry)

  const attempt = async (): Promise<T> => {
    if (!entry.client || !entry.client.usable) {
      const client = await buildAccountClient(accountId)
      try {
        await client.connect()
      } catch (error) {
        try {
          client.close()
        } catch {
          // ignore
        }
        throw error
      }
      entry.client = client
    }
    const client = entry.client
    try {
      return await fn(client)
    } catch (error) {
      const dropped = !client.usable
      try {
        client.close()
      } catch {
        // ignore
      }
      if (entry.client === client) entry.client = null
      throw Object.assign(error instanceof Error ? error : new Error(String(error)), { dropped })
    }
  }

  const run = entry.chain.then(async () => {
    try {
      return await attempt()
    } catch (error) {
      // A pooled connection that went stale while the app sat idle fails the
      // first command. For read-only work, reconnect and try once more instead
      // of surfacing the error (e.g. a message that won't open).
      if (options.retryOnDrop && (error as { dropped?: boolean }).dropped) return attempt()
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
