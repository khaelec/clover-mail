// Local stand-in for nodejs-mobile's `bridge` module. The test drives the engine
// by writing JSON lines to stdin ({ send, args }) and reads the engine's posts
// from stdout. Only used with CLOVER_BRIDGE_STUB=1.
const os = require('node:os')
const path = require('node:path')
const readline = require('node:readline')

const listeners = new Map()

const app = {
  datadir: () => process.env.CLOVER_DATA_DIR || path.join(os.tmpdir(), 'clover-engine-test')
}

const channel = {
  on(name, cb) {
    listeners.set(name, cb)
  },
  post(name, ...args) {
    process.stdout.write(`${JSON.stringify({ post: name, args })}\n`)
  }
}

module.exports = { app, channel }

const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }
  if (msg && msg.send) {
    const cb = listeners.get(msg.send)
    if (cb) cb(...(msg.args ?? []))
  }
})
