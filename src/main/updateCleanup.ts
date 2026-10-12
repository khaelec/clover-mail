import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** True when `candidate` is a strictly greater dotted version than `current`. */
export function isNewerVersion(candidate: string | undefined, current: string): boolean {
  if (!candidate) return false
  const a = candidate.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const b = current.split('.').map((part) => Number.parseInt(part, 10) || 0)
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const left = a[i] ?? 0
    const right = b[i] ?? 0
    if (left > right) return true
    if (left < right) return false
  }
  return false
}

function pruneOlderThan(dir: string, maxAgeMs: number): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    let stats
    try {
      stats = statSync(full)
    } catch {
      continue
    }
    if (stats.isDirectory()) {
      pruneOlderThan(full, maxAgeMs)
    } else if (Date.now() - stats.mtimeMs > maxAgeMs) {
      rmSync(full, { force: true })
    }
  }
}

/**
 * Remove leftover update downloads so the updater cache doesn't grow forever.
 * A pending download is kept only while it is newer than the running version.
 */
export function cleanupUpdateDir(
  dir: string,
  currentVersion: string,
  maxAgeMs = 30 * 24 * 60 * 60 * 1000
): void {
  if (!existsSync(dir)) return
  try {
    const pending = join(dir, 'pending')
    const infoPath = join(pending, 'update-info.json')
    let keepPending = false
    if (existsSync(infoPath)) {
      try {
        const info = JSON.parse(readFileSync(infoPath, 'utf8')) as { version?: string }
        keepPending = isNewerVersion(info.version, currentVersion)
      } catch {
        keepPending = false
      }
    }
    if (existsSync(pending) && !keepPending) {
      rmSync(pending, { recursive: true, force: true })
    }

    // Leftovers from a previous install (copied out of pending/ at install time).
    for (const name of ['installer.exe', 'current.blockmap', 'current.blockmark']) {
      const file = join(dir, name)
      if (existsSync(file)) rmSync(file, { force: true })
    }

    pruneOlderThan(dir, maxAgeMs)

    try {
      if (readdirSync(dir).length === 0) rmSync(dir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  } catch {
    // best effort — never let cleanup break startup
  }
}
