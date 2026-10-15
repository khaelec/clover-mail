import { join } from 'node:path'
import { initDatabase } from '@core/db'
import { setStorageRoot } from '@core/mail/storage'
import { setPlatform } from '@core/platform'
import { dispatch } from '@core/transport/registry'
import { androidPlatform } from './platform'
import { setMailPoster } from './events'
import { registerAndroidHandlers } from './register'

interface BridgeChannel {
  on(event: string, cb: (msg: unknown) => void): void
  post(event: string, ...args: unknown[]): void
}
interface BridgeApp {
  datadir(): string
}

// nodejs-mobile's built-in `bridge` module (provided by the Capacitor Node.js
// plugin). The WebView sends `{ id, channel, args }`; we reply `{ id, ok, … }`,
// and engine events go out as `{ channel, payload }` on the 'event' name.
const bridge = require('bridge') as { app: BridgeApp; channel: BridgeChannel }

// The phone engine runs on nodejs-mobile's Node → the WASM SQLite driver.
process.env.CLOVER_DB_DRIVER = 'wasm'

const dataDir = bridge.app.datadir()

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
