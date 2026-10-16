// Bundles the phone engine (src/mobile/engine/index.ts + the reused src/core,
// src/main/ipc/mail and its npm dependencies) into a single CJS file for
// nodejs-mobile, so the phone loads one file instead of hundreds. Only
// node-sqlite3-wasm (which loads a .wasm beside it) and `bridge` stay external.
// The three Electron imports are aliased to the Electron-free shims beside this
// file. With CLOVER_BRIDGE_STUB=1, `bridge` is aliased to a stdin/stdout stub for
// the local test (no phone needed).
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const version = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version

const alias = {
  '@main/ipcHost': resolve(root, 'src/mobile/engine/ipcHost.ts'),
  '@main/mail/events': resolve(root, 'src/mobile/engine/events.ts'),
  '@main/oauth': resolve(root, 'src/mobile/engine/oauth.ts'),
  // No better-sqlite3 on the phone; the WASM driver is used instead.
  'better-sqlite3': resolve(root, 'src/mobile/engine/betterSqliteStub.ts')
}
const stub = process.env.CLOVER_BRIDGE_STUB === '1'
if (stub) {
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
  // Bundle the engine's dependencies into one file (faster to load/extract on
  // the phone). node-sqlite3-wasm stays external because it loads a .wasm file
  // from its own directory; `bridge` is provided by nodejs-mobile at runtime.
  external: stub ? ['node-sqlite3-wasm'] : ['node-sqlite3-wasm', 'bridge'],
  define: { 'process.env.CLOVER_VERSION': JSON.stringify(version) },
  logLevel: 'warning'
})

console.log('engine bundle ->', outfile)
