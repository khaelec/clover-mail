// Builds the Phase 0 spike into spike/dist (the Capacitor webDir):
//   - the diagnostics UI (index.html/styles.css + bundled app.js)
//   - the Node.js project (with its node_modules) at dist/nodejs
import { rmSync, mkdirSync, cpSync } from 'node:fs'
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

console.log('spike built ->', dist)
