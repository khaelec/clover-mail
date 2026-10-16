import { join } from 'node:path'
import { initDatabase } from '@core/db'
import { setStorageRoot } from '@core/mail/storage'
import { setPlatform } from '@core/platform'
import { dispatch } from '@core/transport/registry'
import { androidPlatform } from './platform'
import { setMailPoster } from './events'
import { registerAndroidHandlers } from './register'
import { runE2eIfConfigured } from './e2e'
import { createMailEmit } from '@main/mail/events'
import { listAccounts } from '@core/mail/accounts'
import { syncAccount } from '@core/mail/sync'
import { installResilientDns } from '@core/net/dns'

interface BridgeChannel {
  on(event: string, cb: (msg: unknown) => void): void
  post(event: string, ...args: unknown[]): void
}
export interface Bridge {
  app: { datadir(): string }
  channel: BridgeChannel
}

/**
 * Starts the on-device engine. `index.ts` requires `bridge` first (so the
 * runtime becomes ready) and calls this inside a try/catch; a failure is
 * reported back over the channel.
 */
export function startEngine(bridge: Bridge): void {
  // The WebView sends `{ id, channel, args }`; we reply `{ id, ok, … }`, and
  // engine events go out as `{ channel, payload }` on the 'event' name.

  // The phone engine runs on nodejs-mobile's Node → the WASM SQLite driver.
  process.env.CLOVER_DB_DRIVER = 'wasm'
  // nodejs-mobile's resolver can fail after the app is backgrounded.
  installResilientDns()

  const dataDir = bridge.app.datadir()
  console.log(`CLOVER_ENGINE_DATADIR ${dataDir}`)

  setPlatform(androidPlatform())
  setMailPoster((channel, payload) => bridge.channel.post('event', { channel, payload }))
  initDatabase(dataDir)
  setStorageRoot(join(dataDir, 'attachments'))
  registerAndroidHandlers({ version: process.env.CLOVER_VERSION ?? '0.0.0', dataDir })

  bridge.channel.on('invoke', (msg) => {
    void (async () => {
      const { id, channel, args } = msg as { id: string; channel: string; args: unknown[] }
      try {
        const result = await dispatch(channel, args)
        bridge.channel.post('reply', { id, ok: true, result })
      } catch (error) {
        bridge.channel.post('reply', {
          id,
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    })()
  })

  bridge.channel.post('ready')
  console.log('CLOVER_ENGINE_READY')

  // The desktop drives syncs from its main process; on the phone the engine owns
  // that. Sync at start-up and every few minutes so mail arrives without the UI
  // asking. Events go out over the channel, so the UI refreshes itself.
  const emit = createMailEmit(() => null)
  let syncing = false
  const syncAll = (): void => {
    // Never overlap syncs — a second run on top of a long first sync doubles the
    // IMAP work and starves the message channel.
    if (syncing) return
    syncing = true
    void (async () => {
      try {
        for (const account of listAccounts()) {
          // A flaky network (DNS blip, timeout) shouldn't fail the whole sync.
          for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
              await syncAccount(account.id, emit)
              break
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error)
              const transient = /ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|EHOSTUNREACH|network/i.test(message)
              if (attempt < 2 && transient) {
                await new Promise((resolve) => setTimeout(resolve, 5000))
                continue
              }
              break
            }
          }
          await new Promise((resolve) => setImmediate(resolve))
        }
      } finally {
        syncing = false
      }
    })()
  }
  setTimeout(syncAll, 3_000)
  setInterval(syncAll, 3 * 60_000)

  // One-off DNS diagnostic, surfaced in the bell. nodejs-mobile's resolver can
  // fail where the phone's own apps resolve fine; this reports which path works.
  const notify = (title: string, body: string): void =>
    bridge.channel.post('event', { channel: 'app:notify', payload: { kind: 'system', title, body } })
  void import('node:dns').then((dns) => {
    dns.lookup('imap.gmail.com', (err, address) => {
      if (!err) {
        notify('DNS ok (system)', address)
        return
      }
      try {
        dns.setServers(['8.8.8.8', '1.1.1.1'])
        dns.resolve4('imap.gmail.com', (err2, addresses) => {
          notify(
            err2 ? `DNS failed (${err.code})` : 'DNS via 8.8.8.8 ok',
            err2 ? String(err2.code) : (addresses?.[0] ?? '')
          )
        })
      } catch {
        notify(`DNS failed (${err.code})`, '')
      }
    })
  })

  // CI emulator only: run the on-device end-to-end check if configured.
  void runE2eIfConfigured(dataDir)
}
