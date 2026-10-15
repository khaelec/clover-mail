// Entry point the nodejs-mobile runtime runs. Keep it tiny and defensive: log
// that we booted, then load + start the engine inside a try/catch so any
// load/start failure shows up in logcat rather than dying silently.
console.log('CLOVER_ENGINE_BOOT')

try {
  const { startEngine } = require('./main') as typeof import('./main')
  startEngine()
} catch (error) {
  console.log(
    `CLOVER_ENGINE_LOAD_ERROR ${error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error)}`
  )
}
