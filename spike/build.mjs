// Builds the Phase 0 spike into spike/dist (the Capacitor webDir):
//   - the diagnostics UI (index.html/styles.css + bundled app.js)
//   - the Node.js project (with its node_modules) at dist/nodejs
import { rmSync, mkdirSync, cpSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { build } from 'esbuild'

const root = process.cwd()
const dist = resolve(root, 'spike/dist')

rmSync(dist, { recursive: true, force: true })
mkdirSync(dist, { recursive: true })

cpSync(resolve(root, 'spike/web/index.html'), resolve(dist, 'index.html'))
cpSync(resolve(root, 'spike/web/styles.css'), resolve(dist, 'styles.css'))

await build({
  entryPoints: [resolve(root, 'spike/web/app.js')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  outfile: resolve(dist, 'app.js'),
  logLevel: 'warning'
})

cpSync(resolve(root, 'spike/node'), resolve(dist, 'nodejs'), { recursive: true })

// nodejs-mobile's Node ships limited Unicode property support (it doesn't know
// \p{Diacritic}), which imapflow uses to strip diacritics from its client info.
// Replace it with the equivalent combining-mark ranges (the string is already
// NFD-normalised, so the marks live in these ranges). This is the only \p{...}
// in the whole dependency tree.
const DIACRITIC = '[\\u0300-\\u036f\\u1ab0-\\u1aff\\u1dc0-\\u1dff\\u20d0-\\u20ff\\ufe20-\\ufe2f]'
let patched = 0
for (const rel of ['cjs/imap-flow.js', 'esm/imap-flow.js']) {
  const file = resolve(dist, 'nodejs/node_modules/imapflow/dist', rel)
  if (!existsSync(file)) continue
  const src = readFileSync(file, 'utf8')
  const next = src.replace(/\\p\{Diacritic\}/g, DIACRITIC)
  if (next !== src) {
    writeFileSync(file, next)
    patched += 1
  }
}
console.log(`patched imapflow \\p{Diacritic} in ${patched} file(s)`)

console.log('spike built ->', dist)
