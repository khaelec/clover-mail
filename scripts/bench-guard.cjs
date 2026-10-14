// Shared safety guard for the benchmark scripts.
//
// Hard rule 1: never touch the real profile. These scripts must run against a
// throwaway --user-data-dir, and we refuse to start unless one is given and it
// resolves outside the real Clover Mail user-data folder.
const path = require('node:path')

function getFlag(name) {
  const args = process.argv.slice(1)
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === name) return args[i + 1] ?? null
    if (arg.startsWith(name + '=')) return arg.slice(name.length + 1)
  }
  return null
}

function outside(parent, child) {
  const rel = path.relative(parent, child)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

/**
 * Resolve and validate the scratch profile directory. Exits the process if it is
 * missing or points at the real profile.
 */
function resolveScratchDir(app) {
  const raw = getFlag('--user-data-dir') || process.env.CLOVER_BENCH_DIR || null
  if (!raw) {
    console.error(
      'REFUSING: pass --user-data-dir <scratch dir> (a throwaway folder, never the real Clover Mail profile).'
    )
    process.exit(2)
  }
  const scratch = path.resolve(raw)
  const appData = app.getPath('appData')
  // The real profile name depends on dev vs packaged; reject both spellings and
  // anything nested inside the appData directory itself.
  const realDirs = [path.join(appData, 'Clover Mail'), path.join(appData, 'clover-mail')].map((p) =>
    path.resolve(p)
  )
  for (const real of realDirs) {
    if (scratch === real || outside(real, scratch)) {
      console.error('REFUSING: --user-data-dir resolves inside the real profile: ' + real)
      process.exit(2)
    }
  }
  return scratch
}

module.exports = { resolveScratchDir, getFlag }
