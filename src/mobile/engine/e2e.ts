import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dispatch } from '@core/transport/registry'
import type {
  AccountSummary,
  BulkActionResult,
  FolderSummary,
  MessageSummary,
  ThreadSummary
} from '@shared/mail'

interface E2eConfig {
  host: string
  port: number
  user: string
  pass: string
}

/**
 * Optional on-device end-to-end check used by the CI emulator. If
 * dist-mobile/nodejs/e2e.json exists, it adds the account, syncs, lists,
 * searches and does archive→Undo, then prints a single `CLOVER_E2E {json}` line
 * (nodejs-mobile's console.log lands in logcat). No-op in a normal build.
 */
export async function runE2eIfConfigured(dataDir: string): Promise<void> {
  const file = join(__dirname, 'e2e.json')
  if (!existsSync(file)) return
  const cfg = JSON.parse(readFileSync(file, 'utf8')) as E2eConfig
  const out: Record<string, unknown> = { ok: false }

  try {
    const account = (await dispatch('mail:create-account', [
      {
        email: cfg.user,
        displayName: 'E2E',
        incoming: { host: cfg.host, port: cfg.port, security: 'none', username: cfg.user },
        outgoing: { host: cfg.host, port: 25, security: 'none', username: cfg.user },
        password: cfg.pass
      }
    ])) as AccountSummary
    out.accountId = account.id

    await dispatch('mail:sync-account', [account.id])

    const folders = (await dispatch('mail:list-folders', [account.id])) as FolderSummary[]
    out.folders = folders.map((f) => f.name)

    const threads = (await dispatch('mail:list-threads', [account.id])) as ThreadSummary[]
    out.threads = threads.length
    const messages = (await dispatch('mail:list-messages', [account.id])) as MessageSummary[]
    out.messages = messages.length

    const search = (await dispatch('mail:search', ['clover', account.id])) as MessageSummary[]
    out.searchHits = Array.isArray(search) ? search.length : 0

    const first = messages[0]
    if (first) {
      const res = (await dispatch('mail:bulk-action', [
        { messageIds: [first.id], action: 'archive' }
      ])) as BulkActionResult
      const afterArchive = (await dispatch('mail:list-messages', [account.id])) as MessageSummary[]
      await dispatch('mail:undo-moves', [res.undo ?? []])
      const afterUndo = (await dispatch('mail:list-messages', [account.id])) as MessageSummary[]
      out.archived = !afterArchive.some((m) => m.id === first.id)
      out.undoRestored = afterUndo.some((m) => m.id === first.id)
    }

    out.ok = (out.messages as number) > 0 && (out.threads as number) > 0
  } catch (error) {
    out.error = error instanceof Error ? error.message : String(error)
  }

  const json = JSON.stringify(out)
  console.log(`CLOVER_E2E ${json}`)
  try {
    writeFileSync(join(dataDir, 'e2e-result.json'), json)
  } catch {
    // best effort — logcat is the primary channel
  }
}
