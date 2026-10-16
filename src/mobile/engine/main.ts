import { join } from 'node:path'
import { closeDatabase, initDatabase } from '@core/db'
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

  // Release the database when the app is backgrounded and reopen on return, so
  // a paused/old engine never holds the file lock across a relaunch.
  const appBridge = bridge.app as unknown as {
    on?: (event: string, cb: (arg?: { release?: () => void }) => void) => void
  }
  appBridge.on?.('pause', (lock) => {
    try {
      closeDatabase()
    } catch {
      // ignore
    }
    lock?.release?.()
  })
  appBridge.on?.('resume', () => {
    try {
      initDatabase(dataDir)
    } catch {
      // ignore
    }
  })

  // The desktop drives syncs from its main process; on the phone the engine owns
  // that. Sync at start-up and every few minutes so mail arrives without the UI
  // asking. Events go out over the channel, so the UI refreshes itself.
  const emit = createMailEmit(() => null)
  const syncAll = (): void => {
    for (const account of listAccounts()) {
      void syncAccount(account.id, emit).catch(() => undefined)
    }
  }
  setTimeout(syncAll, 3_000)
  setInterval(syncAll, 3 * 60_000)

  // CI emulator only: run the on-device end-to-end check if configured.
  void runE2eIfConfigured(dataDir)
}
