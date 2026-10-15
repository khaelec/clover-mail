// Local Phase 2 check: build the phone engine bundle with the bridge stub, run
// it under Node (WASM SQLite driver), and drive real channel calls through the
// message channel — no Electron, no phone.
//
//   node src/mobile/engine/test-bridge.mjs
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()
// Inside the repo so external `require`s (drizzle-orm, …) resolve node_modules.
mkdirSync(join(root, 'mobile-engine'), { recursive: true })
const bundle = join(root, 'mobile-engine', 'test-bridge.cjs')
const dataDir = mkdtempSync(join(tmpdir(), 'clover-engine-data-'))

const built = spawnSync(process.execPath, [join(root, 'src/mobile/engine/build.mjs')], {
  env: { ...process.env, CLOVER_BRIDGE_STUB: '1', CLOVER_ENGINE_OUT: bundle },
  stdio: 'inherit'
})
if (built.status !== 0) process.exit(1)

const child = spawn(process.execPath, [bundle], {
  env: { ...process.env, CLOVER_DATA_DIR: dataDir },
  stdio: ['pipe', 'pipe', 'inherit']
})

const posts = []
let buf = ''
child.stdout.on('data', (chunk) => {
  buf += chunk.toString()
  let nl
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl)
    buf = buf.slice(nl + 1)
    try {
      posts.push(JSON.parse(line))
    } catch {
      // ignore non-JSON
    }
  }
})

const waitFor = async (pred, ms = 10000) => {
  const start = Date.now()
  while (Date.now() - start < ms) {
    const hit = posts.find(pred)
    if (hit) return hit
    await new Promise((r) => setTimeout(r, 50))
  }
  return null
}

let nextId = 0
const invoke = (channel, args) => {
  const id = String(++nextId)
  child.stdin.write(`${JSON.stringify({ send: 'invoke', args: [{ id, channel, args }] })}\n`)
  return waitFor((p) => p.post === 'reply' && p.args[0]?.id === id)
}

const results = {}
results.ready = !!(await waitFor((p) => p.post === 'ready'))
results.appInfo = (await invoke('app:info', []))?.args[0]
results.setSetting = (await invoke('settings:set', ['test.key', 42]))?.args[0]
results.getSetting = (await invoke('settings:get', ['test.key']))?.args[0]
results.notificationsSave = (
  await invoke('notifications:save', [
    [{ id: 'n1', kind: 'system', title: 'Hi', body: '', at: 1, read: false }]
  ])
)?.args[0]
results.notificationsList = (await invoke('notifications:list', []))?.args[0]
results.listAccounts = (await invoke('mail:list-accounts', []))?.args[0]
results.listLabels = (await invoke('mail:list-labels', []))?.args[0]
results.unknown = (await invoke('nope:nope', []))?.args[0]

child.kill()

const checks = {
  ready: results.ready === true,
  appInfo: results.appInfo?.ok === true && results.appInfo.result?.name === 'Clover Mail',
  settingsRoundTrip: results.getSetting?.ok === true && results.getSetting.result === 42,
  notificationsRoundTrip:
    results.notificationsList?.ok === true && results.notificationsList.result?.length === 1,
  listAccounts: results.listAccounts?.ok === true && Array.isArray(results.listAccounts.result),
  listLabels: results.listLabels?.ok === true && Array.isArray(results.listLabels.result),
  unknownChannelErrors: results.unknown?.ok === false
}

console.log(JSON.stringify({ checks, results }, null, 2))
const ok = Object.values(checks).every(Boolean)
console.log(ok ? 'ENGINE_BRIDGE_OK' : 'ENGINE_BRIDGE_FAIL')
process.exit(ok ? 0 : 1)
