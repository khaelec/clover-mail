// Validation for notifications captured from app webviews. The page is
// untrusted, so the host only accepts the one expected payload shape, caps
// lengths, strips any HTML, and rate-limits per app.

const RATE_MAX = 20
const RATE_WINDOW_MS = 60_000

const recent = new Map<string, number[]>()

export function acceptAppNotification(appId: string): boolean {
  const now = Date.now()
  const kept = (recent.get(appId) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  if (kept.length >= RATE_MAX) {
    recent.set(appId, kept)
    return false
  }
  kept.push(now)
  recent.set(appId, kept)
  return true
}

export function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

export interface CapturedNotification {
  id?: string
  title: string
  body: string
}

export function parseCapturedNotification(payload: unknown): CapturedNotification | null {
  if (!payload || typeof payload !== 'object') return null
  const raw = payload as { id?: unknown; title?: unknown; body?: unknown }
  const title = cleanText(raw.title, 200)
  const body = cleanText(raw.body, 500)
  if (!title && !body) return null
  return { id: typeof raw.id === 'string' ? raw.id : undefined, title, body }
}
