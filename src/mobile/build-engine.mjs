// Prepares the Node project the Android app runs in nodejs-mobile:
//   1. installs src/mobile/app's deps (once) and copies it to dist-mobile/nodejs
//   2. bundles the Electron-free engine on top as dist-mobile/nodejs/index.js
//   3. patches imapflow's \p{Diacritic} (nodejs-mobile's Node lacks that property)
// Run `npm run mobile:web` afterwards to add the WebView UI to dist-mobile.
import { rmSync, mkdirSync, cpSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const dist = resolve(root, 'dist-mobile')
const nodeDir = resolve(dist, 'nodejs')
const appDir = resolve(root, 'src/mobile/app')

rmSync(dist, { recursive: true, force: true })
mkdirSync(nodeDir, { recursive: true })

// Clean install so removed deps are pruned (the engine bundles its own deps;
// only node-sqlite3-wasm ships beside index.js).
console.log('installing the engine Node project deps…')
rmSync(resolve(appDir, 'node_modules'), { recursive: true, force: true })
rmSync(resolve(appDir, 'package-lock.json'), { force: true })
// cwd (not --prefix) so the space in the repo path is not a shell argument.
const install = spawnSync('npm', ['install'], { cwd: appDir, stdio: 'inherit', shell: true })
if (install.status !== 0) process.exit(install.status ?? 1)
cpSync(appDir, nodeDir, { recursive: true })

const bundle = spawnSync(process.execPath, [resolve(root, 'src/mobile/engine/build.mjs')], {
  env: { ...process.env, CLOVER_ENGINE_OUT: resolve(nodeDir, 'index.js') },
  stdio: 'inherit'
})
if (bundle.status !== 0) process.exit(bundle.status ?? 1)

// nodejs-mobile's Node ships limited Unicode property support (no \p{Diacritic}),
// which imapflow uses to strip diacritics. imapflow is bundled into index.js, so
// patch the bundle. It's the only \p{...} in the dependency tree.
const DIACRITIC = '[\\u0300-\\u036f\\u1ab0-\\u1aff\\u1dc0-\\u1dff\\u20d0-\\u20ff\\ufe20-\\ufe2f]'
const bundleFile = resolve(nodeDir, 'index.js')
const source = readFileSync(bundleFile, 'utf8')
const patched = source.replace(/\\p\{Diacritic\}/g, DIACRITIC)
if (patched !== source) writeFileSync(bundleFile, patched)
console.log(
  `engine Node project ready at ${nodeDir} (imapflow \\p{Diacritic} patched: ${patched !== source})`
)
