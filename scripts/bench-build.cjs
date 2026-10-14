// Build with CLOVER_BENCH=1 so the list benchmark instrumentation is compiled in.
// Cross-platform: sets the env var and runs the local electron-vite CLI.
const { spawnSync } = require('node:child_process')
const path = require('node:path')

const cli = path.join(__dirname, '..', 'node_modules', 'electron-vite', 'bin', 'electron-vite.js')
// A production bench build matches what ships (StrictMode's dev-only double
// render is absent), so the row-render counts are the real ones. <Profiler>
// timings only report under React's development build.
const result = spawnSync(process.execPath, [cli, 'build'], {
  stdio: 'inherit',
  env: { ...process.env, CLOVER_BENCH: '1' }
})
process.exit(result.status ?? 1)
