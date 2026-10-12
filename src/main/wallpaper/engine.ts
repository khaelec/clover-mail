import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { WeDetection, WeWallpaper } from '@shared/wallpaper'

const WE_APP_ID = '431960'

function reg(query: string): string | null {
  try {
    return execSync(query, { encoding: 'utf8', windowsHide: true })
  } catch {
    return null
  }
}

export function findSteamPath(): string | null {
  const queries = [
    'reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath',
    'reg query "HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam" /v InstallPath',
    'reg query "HKLM\\SOFTWARE\\Valve\\Steam" /v InstallPath'
  ]
  for (const query of queries) {
    const out = reg(query)
    if (out) {
      const match = out.match(/(SteamPath|InstallPath)\s+REG_SZ\s+(.+)/i)
      if (match) return match[2].trim().replace(/\//g, '\\')
    }
  }
  const fallbacks = ['C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam', 'C:\\Steam']
  return fallbacks.find(existsSync) ?? null
}

function libraryPaths(steamPath: string): string[] {
  const dirs = new Set<string>([steamPath])
  const vdf = join(steamPath, 'steamapps', 'libraryfolders.vdf')
  if (existsSync(vdf)) {
    try {
      const text = readFileSync(vdf, 'utf8')
      for (const match of text.matchAll(/"path"\s+"([^"]+)"/g)) {
        dirs.add(match[1].replace(/\\\\/g, '\\'))
      }
    } catch {
      // ignore unreadable library file
    }
  }
  return [...dirs]
}

interface Project {
  title: string
  type: string
  file: string | null
  preview: string | null
}

function readProject(dir: string): Project | null {
  const projectFile = join(dir, 'project.json')
  if (!existsSync(projectFile)) return null
  try {
    const json = JSON.parse(readFileSync(projectFile, 'utf8')) as {
      title?: string
      type?: string
      file?: string
      preview?: string
    }
    return {
      title: json.title ?? dir,
      type: json.type ?? 'unknown',
      file: json.file ?? null,
      preview: json.preview ?? null
    }
  } catch {
    return null
  }
}

function findPreview(dir: string, declared: string | null): string | null {
  if (declared) {
    const candidate = join(dir, declared)
    if (existsSync(candidate)) return candidate
  }
  for (const name of ['preview.jpg', 'preview.png', 'preview.gif', 'preview.webp']) {
    const candidate = join(dir, name)
    if (existsSync(candidate)) return candidate
  }
  return null
}

function toEntry(id: string, dir: string, source: 'workshop' | 'project'): WeWallpaper | null {
  const project = readProject(dir)
  if (!project) return null

  let kind: 'video' | 'html' | null = null
  let filePath = ''
  if (project.file) {
    const abs = join(dir, project.file)
    if (existsSync(abs)) {
      const lower = abs.toLowerCase()
      if (project.type === 'video' || lower.endsWith('.mp4') || lower.endsWith('.webm')) {
        kind = 'video'
        filePath = abs
      } else if (project.type === 'web' && (lower.endsWith('.html') || lower.endsWith('.htm'))) {
        kind = 'html'
        filePath = abs
      }
    }
  }

  return {
    id,
    title: project.title,
    type: project.type,
    supported: kind !== null,
    kind,
    path: filePath,
    preview: findPreview(dir, project.preview),
    source
  }
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

export function detectWallpaperEngine(): WeDetection {
  const steam = findSteamPath()
  const libs = steam ? libraryPaths(steam) : []
  const engineDirs = libs
    .map((lib) => join(lib, 'steamapps', 'common', 'wallpaper_engine'))
    .filter(existsSync)

  const wallpapers: WeWallpaper[] = []
  const seen = new Set<string>()

  const add = (entry: WeWallpaper | null): void => {
    if (entry && !seen.has(entry.path || entry.id)) {
      seen.add(entry.path || entry.id)
      wallpapers.push(entry)
    }
  }

  // Steam Workshop subscriptions.
  for (const lib of libs) {
    const workshop = join(lib, 'steamapps', 'workshop', 'content', WE_APP_ID)
    for (const id of safeReaddir(workshop)) {
      add(toEntry(id, join(workshop, id), 'workshop'))
    }
  }

  // Local projects under the Wallpaper Engine install.
  for (const engine of engineDirs) {
    const projects = join(engine, 'projects')
    for (const sub of safeReaddir(projects)) {
      const subDir = join(projects, sub)
      if (existsSync(join(subDir, 'project.json'))) {
        add(toEntry(sub, subDir, 'project'))
      } else {
        for (const name of safeReaddir(subDir)) {
          const dir = join(subDir, name)
          if (existsSync(join(dir, 'project.json'))) add(toEntry(name, dir, 'project'))
        }
      }
    }
  }

  wallpapers.sort((a, b) => Number(b.supported) - Number(a.supported) || a.title.localeCompare(b.title))
  return { installed: engineDirs.length > 0, dirs: engineDirs, wallpapers }
}
