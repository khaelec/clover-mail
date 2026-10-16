// Entry point the nodejs-mobile runtime runs.
//
// Require `bridge` FIRST: the plugin marks the runtime "ready" as soon as the
// node project requires it, so the WebView can then talk to us. Then load the
// engine inside a try/catch — if it throws, we answer every channel call with
// the error so the app can show it (logcat is silent from nodejs-mobile).
const bridge = require('bridge') as {
  app: { datadir(): string }
  channel: { on(event: string, cb: (msg: unknown) => void): void; post(event: string, ...args: unknown[]): void }
}

console.log('CLOVER_ENGINE_BOOT')

// Never let one bad operation kill the whole runtime — keep serving the UI.
process.on('uncaughtException', (error) => {
  console.log(`CLOVER_ENGINE_UNCAUGHT ${error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error)}`)
})
process.on('unhandledRejection', (reason) => {
  console.log(`CLOVER_ENGINE_REJECTION ${reason instanceof Error ? `${reason.message}\n${reason.stack ?? ''}` : String(reason)}`)
})

let loadError: string | null = null
try {
  const { startEngine } = require('./main') as typeof import('./main')
  startEngine(bridge)
} catch (error) {
  loadError = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error)
  console.log(`CLOVER_ENGINE_LOAD_ERROR ${loadError}`)
}

if (loadError) {
  bridge.channel.on('invoke', (msg) => {
    const { id } = msg as { id: string }
    bridge.channel.post('reply', { id, ok: false, error: `engine failed to load: ${loadError}` })
  })
}
