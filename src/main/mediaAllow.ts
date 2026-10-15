import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { SETTINGS_KEY_WALLPAPER, type WallpaperSettings } from '@shared/wallpaper'
import { getSetting } from '@core/settings'
import { detectWallpaperEngine } from '@main/wallpaper/engine'

/**
 * Allowlist for the `clover-media://` protocol. Without it the scheme serves any
 * file with a media extension anywhere on disk; here we restrict it to the user
 * data folder (attachments), files/folders the user explicitly picked, and the
 * Wallpaper Engine assets we can discover.
 */
let dataDir = ''
let allowFile = ''
const dirs = new Set<string>()
const files = new Set<string>()
let loaded = false
let scannedEngine = false

function norm(path: string): string {
  const resolved = resolve(path)
  // Windows paths are case-insensitive, so compare them lowercased.
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function insideDir(child: string, parent: string): boolean {
  if (child === parent) return true
  const rel = relative(parent, child)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

function addExistingPath(path: string): boolean {
  if (!path || /^https?:\/\//i.test(path)) return false
  try {
    const value = norm(path)
    if (statSync(path).isDirectory()) dirs.add(value)
    else files.add(value)
    return true
  } catch {
    // The path is gone; nothing to allow.
    return false
  }
}

function persist(): void {
  try {
    writeFileSync(allowFile, JSON.stringify({ dirs: [...dirs], files: [...files] }, null, 2))
  } catch {
    // Best effort — an unwritable allowlist just means re-picking next launch.
  }
}

function load(): void {
  if (loaded) return
  loaded = true
  if (dataDir) dirs.add(norm(dataDir))
  try {
    const raw = JSON.parse(readFileSync(allowFile, 'utf8')) as { dirs?: string[]; files?: string[] }
    for (const d of raw.dirs ?? []) dirs.add(norm(d))
    for (const f of raw.files ?? []) files.add(norm(f))
  } catch {
    // First run or unreadable — start from the defaults.
  }
  // Keep the currently configured wallpaper working across updates, even though
  // it may live outside the user data folder.
  try {
    const wallpaper = getSetting<Partial<WallpaperSettings>>(SETTINGS_KEY_WALLPAPER)
    if (wallpaper) {
      for (const path of [wallpaper.source, ...(wallpaper.sources ?? [])]) {
        if (path) addExistingPath(path)
      }
    }
  } catch {
    // Settings aren't ready yet; requests retry after the DB initialises.
  }
}

function scanEngine(): void {
  if (scannedEngine) return
  scannedEngine = true
  try {
    const detection = detectWallpaperEngine()
    for (const dir of detection.dirs) dirs.add(norm(dir))
    for (const wallpaper of detection.wallpapers) {
      // Allow the wallpaper's own folder so it can load sibling assets.
      for (const path of [wallpaper.path, wallpaper.preview]) {
        if (path) dirs.add(norm(dirname(path)))
      }
    }
  } catch {
    // Detection is best-effort (registry / Steam lookups can fail).
  }
}

export function initMediaAllow(userDataDir: string): void {
  dataDir = userDataDir
  allowFile = join(userDataDir, 'media-allow.json')
  dirs.clear()
  files.clear()
  loaded = false
  scannedEngine = false
}

/** Record a file or folder the user just picked, and persist it for next launch. */
export function allowMediaPath(path: string): void {
  load()
  if (addExistingPath(path)) persist()
}

export function isMediaPathAllowed(path: string): boolean {
  if (!path) return false
  load()
  const value = norm(path)
  if (files.has(value)) return true
  for (const dir of dirs) if (insideDir(value, dir)) return true
  // Only pay for Wallpaper Engine detection if the fast checks miss.
  scanEngine()
  if (files.has(value)) return true
  for (const dir of dirs) if (insideDir(value, dir)) return true
  return false
}
