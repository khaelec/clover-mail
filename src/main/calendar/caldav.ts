import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { calendars } from '../db/schema'
import { getSecret, setSecret } from '../settings/secrets'
import { importIcsText, toCalendar, touchCalendarSync } from './index'
import type { Calendar, ImportResult } from '@shared/calendar'

const PALETTE = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#f43f5e', '#64748b']

const REPORT_BODY = `<?xml version="1.0" encoding="utf-8" ?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag/><c:calendar-data/></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"/></c:comp-filter></c:filter>
</c:calendar-query>`

function authHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
}

function decodeXml(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#13;/g, '\r')
    .replace(/&#10;/g, '\n')
    .replace(/&amp;/g, '&')
}

function extractCalendarData(xml: string): string[] {
  const out: string[] = []
  const re = /<(?:[\w-]+:)?calendar-data[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?calendar-data>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(xml)) !== null) out.push(decodeXml(match[1]))
  return out
}

export async function addCaldavCalendar(
  name: string,
  url: string,
  username: string,
  password: string
): Promise<Calendar> {
  const db = getDb()
  const id = randomUUID()
  const secretRef = `caldav:${id}`
  setSecret(secretRef, password)
  const count = db.select().from(calendars).all().length
  db.insert(calendars)
    .values({
      id,
      name: name.trim() || 'CalDAV',
      color: PALETTE[count % PALETTE.length],
      isVisible: true,
      kind: 'caldav',
      url,
      username,
      secretRef,
      createdAt: Date.now()
    })
    .run()
  return toCalendar(db.select().from(calendars).where(eq(calendars.id, id)).get()!)
}

export async function syncCaldav(calendarId: string): Promise<ImportResult> {
  const db = getDb()
  const row = db.select().from(calendars).where(eq(calendars.id, calendarId)).get()
  if (!row || row.kind !== 'caldav' || !row.url || !row.username || !row.secretRef) {
    return { imported: 0, updated: 0, skipped: 0 }
  }
  const password = getSecret(row.secretRef)
  if (password === undefined) throw new Error('Missing saved password for this calendar.')

  const response = await fetch(row.url, {
    method: 'REPORT',
    headers: {
      Authorization: authHeader(row.username, password),
      Depth: '1',
      'Content-Type': 'application/xml; charset=utf-8'
    },
    body: REPORT_BODY
  })
  if (response.status === 401 || response.status === 403) {
    throw new Error('CalDAV authentication failed — check the username and password.')
  }
  if (!response.ok) throw new Error(`CalDAV server returned ${response.status}.`)

  const blocks = extractCalendarData(await response.text())
  let imported = 0
  let updated = 0
  let skipped = 0
  for (const block of blocks) {
    const result = importIcsText(block, calendarId)
    imported += result.imported
    updated += result.updated
    skipped += result.skipped
  }
  touchCalendarSync(calendarId)
  return { imported, updated, skipped }
}

/** Pull-sync every CalDAV calendar; returns how many succeeded. */
export async function syncAllCaldav(): Promise<number> {
  const rows = getDb().select().from(calendars).where(eq(calendars.kind, 'caldav')).all()
  let ok = 0
  for (const row of rows) {
    try {
      await syncCaldav(row.id)
      ok += 1
    } catch {
      // keep going; a failing server shouldn't block the rest
    }
  }
  return ok
}
