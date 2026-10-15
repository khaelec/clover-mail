// Bundles the phone engine (src/mobile/engine/index.ts + the reused src/core and
// src/main/ipc/mail) into a single CJS file for nodejs-mobile. node_modules stay
// external — the Capacitor Node project ships them. The three Electron imports
// are aliased to the Electron-free shims beside this file. With
// CLOVER_BRIDGE_STUB=1, `bridge` is aliased to a stdin/stdout stub for the local
// test (no phone needed).
import { build } from 'esbuild'
import { resolve } from 'node:path'

const root = process.cwd()

const alias = {
  '@main/ipcHost': resolve(root, 'src/mobile/engine/ipcHost.ts'),
  '@main/mail/events': resolve(root, 'src/mobile/engine/events.ts'),
  '@main/oauth': resolve(root, 'src/mobile/engine/oauth.ts'),
  // No better-sqlite3 on the phone; the WASM driver is used instead.
  'better-sqlite3': resolve(root, 'src/mobile/engine/betterSqliteStub.ts')
}
if (process.env.CLOVER_BRIDGE_STUB === '1') {
  alias['bridge'] = resolve(root, 'src/mobile/engine/bridge-stub.cjs')
}

const outfile = resolve(root, process.env.CLOVER_ENGINE_OUT ?? 'mobile-engine/index.js')

await build({
  entryPoints: [resolve(root, 'src/mobile/engine/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile,
  tsconfig: resolve(root, 'tsconfig.node.json'),
  alias,
  packages: 'external',
  logLevel: 'warning'
})

console.log('engine bundle ->', outfile)
