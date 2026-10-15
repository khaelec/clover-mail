import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { asc, eq } from 'drizzle-orm'
import { session } from 'electron'
import { getDb } from '../db'
import { customWebApps } from '../db/schema'
import type { CreateAppInput, CustomApp } from '@shared/apps'

let iconsDir = ''

export function setAppsRoot(userDataDir: string): void {
  iconsDir = join(userDataDir, 'app-icons')
  mkdirSync(iconsDir, { recursive: true })
}

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}

function iconDataUrl(iconRef: string | null): string | null {
  if (!iconRef) return null
  const path = join(iconsDir, iconRef)
  if (!existsSync(path)) return null
  const mime = MIME[extname(iconRef).toLowerCase()] ?? 'image/png'
  return `data:${mime};base64,${readFileSync(path).toString('base64')}`
}

function toApp(row: typeof customWebApps.$inferSelect): CustomApp {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    iconDataUrl: iconDataUrl(row.iconRef),
    windowMode: (row.windowMode as 'inline' | 'window') ?? 'inline',
    isPinned: row.isPinned,
    sortOrder: row.sortOrder,
    runInBackground: row.runInBackground
  }
}

const ALLOWED_PERMISSIONS = new Set(['notifications', 'media', 'fullscreen', 'clipboard-read'])

/** Let embedded apps post notifications (new message alerts) and use the mic/camera. */
function configureAppSession(appId: string): void {
  const ses = session.fromPartition(`persist:app-${appId}`)
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission))
  })
  ses.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission))
}

export function configureAppSessions(): void {
  for (const app of listApps()) configureAppSession(app.id)
}

export function listApps(): CustomApp[] {
  const apps = getDb()
    .select()
    .from(customWebApps)
    .orderBy(asc(customWebApps.sortOrder), asc(customWebApps.createdAt))
    .all()
    .map(toApp)
  for (const app of apps) configureAppSession(app.id)
  return apps
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim()
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { redirect: 'follow' })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

interface Discovered {
  name: string | null
  startUrl: string | null
  manifestUrl: string | null
  iconUrl: string | null
}

async function discover(inputUrl: string): Promise<Discovered> {
  const target = normalizeUrl(inputUrl)
  const base = new URL(target)
  const empty: Discovered = { name: null, startUrl: null, manifestUrl: null, iconUrl: null }

  const html = await fetchText(target)
  if (!html) return empty

  let manifestUrl: string | null = null
  const linkMatch = html.match(/<link[^>]+rel=["']?manifest["']?[^>]*>/i)
  if (linkMatch) {
    const href = linkMatch[0].match(/href=["']([^"']+)["']/i)?.[1]
    if (href) manifestUrl = new URL(href, base).toString()
  }

  let name: string | null = null
  let startUrl: string | null = null
  let iconUrl: string | null = null

  if (manifestUrl) {
    const json = await fetchText(manifestUrl)
    if (json) {
      try {
        const manifest = JSON.parse(json) as {
          name?: string
          short_name?: string
          start_url?: string
          icons?: { src: string; sizes?: string }[]
        }
        name = manifest.name ?? manifest.short_name ?? null
        if (manifest.start_url) startUrl = new URL(manifest.start_url, base).toString()
        const icons = Array.isArray(manifest.icons) ? [...manifest.icons] : []
        if (icons.length) {
          icons.sort(
            (a, b) =>
              (parseInt(b.sizes ?? '0', 10) || 0) - (parseInt(a.sizes ?? '0', 10) || 0)
          )
          if (icons[0]?.src) iconUrl = new URL(icons[0].src, base).toString()
        }
      } catch {
        // Malformed manifest — fall through to defaults.
      }
    }
  }

  if (!iconUrl) iconUrl = new URL('/favicon.ico', base).toString()
  if (!name) {
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
    name = titleMatch?.[1]?.trim() || base.hostname
  }

  return { name, startUrl, manifestUrl, iconUrl }
}

async function downloadIcon(url: string, id: string): Promise<string | null> {
  try {
    const res = await fetch(url, { redirect: 'follow' })
    if (!res.ok) return null
    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.length === 0 || buffer.length > 2_000_000) return null

    const type = res.headers.get('content-type') ?? ''
    let ext = '.png'
    if (type.includes('svg')) ext = '.svg'
    else if (type.includes('jpeg') || type.includes('jpg')) ext = '.jpg'
    else if (type.includes('icon')) ext = '.ico'
    else if (type.includes('webp')) ext = '.webp'
    else if (type.includes('gif')) ext = '.gif'
    else {
      const guessed = extname(new URL(url).pathname).toLowerCase()
      if (MIME[guessed]) ext = guessed
    }

    const ref = `${id}${ext}`
    writeFileSync(join(iconsDir, ref), buffer)
    return ref
  } catch {
    return null
  }
}

export async function createApp(input: CreateAppInput): Promise<CustomApp> {
  const id = randomUUID()
  const target = normalizeUrl(input.url)
  const info = await discover(target)
  const name = input.name?.trim() || info.name || new URL(target).hostname
  const loadUrl = info.startUrl ?? target
  const iconRef = info.iconUrl ? await downloadIcon(info.iconUrl, id) : null

  getDb()
    .insert(customWebApps)
    .values({
      id,
      name,
      url: loadUrl,
      manifestUrl: info.manifestUrl,
      iconRef,
      windowMode: 'inline',
      isPinned: false,
      sortOrder: 0,
      createdAt: Date.now()
    })
    .run()

  return listApps().find((app) => app.id === id) as CustomApp
}

export function removeApp(id: string): void {
  const db = getDb()
  const row = db.select().from(customWebApps).where(eq(customWebApps.id, id)).get()
  if (row?.iconRef) {
    const path = join(iconsDir, row.iconRef)
    if (existsSync(path)) rmSync(path)
  }
  db.delete(customWebApps).where(eq(customWebApps.id, id)).run()
}

export function updateApp(id: string, patch: Partial<CustomApp>): void {
  const set: Partial<typeof customWebApps.$inferInsert> = {}
  if (patch.name !== undefined) set.name = patch.name
  if (patch.url !== undefined) set.url = patch.url
  if (patch.windowMode !== undefined) set.windowMode = patch.windowMode
  if (patch.isPinned !== undefined) set.isPinned = patch.isPinned
  if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder
  if (patch.runInBackground !== undefined) set.runInBackground = patch.runInBackground
  if (Object.keys(set).length === 0) return
  getDb().update(customWebApps).set(set).where(eq(customWebApps.id, id)).run()
}
