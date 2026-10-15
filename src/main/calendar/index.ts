import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import ical from 'node-ical'
import { RRule } from 'rrule'
import { asc, eq } from 'drizzle-orm'
import { platform } from '../platform'
import { getDb } from '@core/db'
import { attachments, calendarEventAttendees, calendarEvents, calendars } from '@core/db/schema'
import { attachmentAbsolutePath } from '../mail/storage'
import { deleteSecret } from '../settings/secrets'
import type {
  AttendeeLite,
  Calendar,
  CalendarEvent,
  EventInput,
  ImportResult,
  Occurrence
} from '@shared/calendar'

const DEFAULT_COLOR = '#10b981'
const CAL_PALETTE = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#f43f5e', '#64748b']

export function ensureDefaultCalendar(): Calendar {
  const db = getDb()
  const existing = db.select().from(calendars).orderBy(asc(calendars.createdAt)).all()
  if (existing.length > 0) return toCalendar(existing[0])
  const id = randomUUID()
  db.insert(calendars)
    .values({ id, name: 'Personal', color: DEFAULT_COLOR, isVisible: true, createdAt: Date.now() })
    .run()
  return toCalendar(db.select().from(calendars).where(eq(calendars.id, id)).get()!)
}

export function toCalendar(row: typeof calendars.$inferSelect): Calendar {
  return {
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    color: row.color,
    isVisible: row.isVisible,
    kind: row.kind === 'caldav' ? 'caldav' : 'local',
    url: row.url,
    lastSyncAt: row.lastSyncAt
  }
}

export function touchCalendarSync(id: string): void {
  getDb().update(calendars).set({ lastSyncAt: Date.now() }).where(eq(calendars.id, id)).run()
}

export function removeCalendar(id: string): void {
  const db = getDb()
  const row = db.select().from(calendars).where(eq(calendars.id, id)).get()
  const rows = db.select().from(calendarEvents).where(eq(calendarEvents.calendarId, id)).all()
  for (const event of rows) {
    db.delete(calendarEventAttendees).where(eq(calendarEventAttendees.eventId, event.id)).run()
  }
  db.delete(calendarEvents).where(eq(calendarEvents.calendarId, id)).run()
  db.delete(calendars).where(eq(calendars.id, id)).run()
  if (row?.secretRef) deleteSecret(row.secretRef)
}

export function listCalendars(): Calendar[] {
  ensureDefaultCalendar()
  return getDb().select().from(calendars).orderBy(asc(calendars.createdAt)).all().map(toCalendar)
}

export function createCalendar(name: string, color?: string): Calendar {
  const db = getDb()
  const count = db.select().from(calendars).all().length
  const id = randomUUID()
  db.insert(calendars)
    .values({
      id,
      name,
      color: color ?? CAL_PALETTE[count % CAL_PALETTE.length],
      isVisible: true,
      createdAt: Date.now()
    })
    .run()
  return toCalendar(db.select().from(calendars).where(eq(calendars.id, id)).get()!)
}

function attendeesFor(eventId: string): AttendeeLite[] {
  return getDb()
    .select()
    .from(calendarEventAttendees)
    .where(eq(calendarEventAttendees.eventId, eventId))
    .all()
    .map((a) => ({ email: a.email, name: a.name, partstat: a.partstat }))
}

function toEvent(row: typeof calendarEvents.$inferSelect): CalendarEvent {
  return {
    id: row.id,
    calendarId: row.calendarId,
    uid: row.uid,
    summary: row.summary,
    description: row.description,
    location: row.location,
    startUtc: row.startUtc,
    endUtc: row.endUtc,
    isAllDay: row.isAllDay,
    rrule: row.rrule,
    status: row.status,
    organizer: row.organizer,
    isRecurring: Boolean(row.rrule),
    attendees: attendeesFor(row.id)
  }
}

export function getEvent(id: string): CalendarEvent | null {
  const row = getDb().select().from(calendarEvents).where(eq(calendarEvents.id, id)).get()
  return row ? toEvent(row) : null
}

function parseExdate(json: string | null): number[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? (parsed as number[]) : []
  } catch {
    return []
  }
}

export function listOccurrences(startUtc: number, endUtc: number): Occurrence[] {
  const rows = getDb().select().from(calendarEvents).all()
  const out: Occurrence[] = []

  for (const row of rows) {
    const push = (start: number, end: number, recurring: boolean): void => {
      out.push({
        eventId: row.id,
        calendarId: row.calendarId,
        summary: row.summary,
        location: row.location,
        startUtc: start,
        endUtc: end,
        isAllDay: row.isAllDay,
        isRecurring: recurring
      })
    }

    if (!row.rrule) {
      if (row.startUtc < endUtc && row.endUtc > startUtc) push(row.startUtc, row.endUtc, false)
      continue
    }

    let rule: RRule | null = null
    try {
      rule = new RRule({ ...RRule.parseString(row.rrule), dtstart: new Date(row.startUtc) })
    } catch {
      rule = null
    }
    if (!rule) {
      if (row.startUtc < endUtc && row.endUtc > startUtc) push(row.startUtc, row.endUtc, false)
      continue
    }

    const duration = row.endUtc - row.startUtc
    const exdates = new Set(parseExdate(row.exdate))
    for (const date of rule.between(new Date(startUtc), new Date(endUtc), true)) {
      const start = date.getTime()
      if (exdates.has(start)) continue
      push(start, start + duration, true)
    }
  }

  return out.sort((a, b) => a.startUtc - b.startUtc)
}

export function createEvent(input: EventInput): CalendarEvent {
  const db = getDb()
  const id = randomUUID()
  const now = Date.now()
  db.insert(calendarEvents)
    .values({
      id,
      calendarId: input.calendarId,
      uid: randomUUID(),
      sequence: 0,
      summary: input.summary,
      description: input.description ?? null,
      location: input.location ?? null,
      startUtc: input.startUtc,
      endUtc: input.endUtc,
      isAllDay: input.isAllDay ?? false,
      rrule: input.rrule ?? null,
      createdAt: now,
      updatedAt: now
    })
    .run()
  return getEvent(id) as CalendarEvent
}

export function updateEvent(id: string, input: EventInput): CalendarEvent {
  getDb()
    .update(calendarEvents)
    .set({
      calendarId: input.calendarId,
      summary: input.summary,
      description: input.description ?? null,
      location: input.location ?? null,
      startUtc: input.startUtc,
      endUtc: input.endUtc,
      isAllDay: input.isAllDay ?? false,
      rrule: input.rrule ?? null,
      updatedAt: Date.now()
    })
    .where(eq(calendarEvents.id, id))
    .run()
  return getEvent(id) as CalendarEvent
}

export function deleteEvent(id: string): void {
  getDb().delete(calendarEvents).where(eq(calendarEvents.id, id)).run()
}

function extractRrule(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const text = String((value as { toString: () => string }).toString())
  const match = text.match(/RRULE:([^\n\r]+)/)
  return match ? match[1].trim() : null
}

function extractExdate(value: unknown): number[] {
  if (!value) return []
  const dates: number[] = []
  const visit = (item: unknown): void => {
    if (item instanceof Date) dates.push(item.getTime())
    else if (Array.isArray(item)) item.forEach(visit)
    else if (item && typeof item === 'object') {
      for (const child of Object.values(item as Record<string, unknown>)) visit(child)
    }
  }
  visit(value)
  return dates
}

function extractAttendees(value: unknown): AttendeeLite[] {
  const list = Array.isArray(value) ? value : value ? [value] : []
  return list
    .map((entry) => {
      const item = entry as { params?: Record<string, string>; val?: string }
      return {
        email: item.val ?? item.params?.EMAIL ?? null,
        name: item.params?.CN ?? null,
        partstat: item.params?.PARTSTAT ?? null
      }
    })
    .filter((a) => a.email || a.name)
}

export function importIcsText(text: string, calendarId?: string): ImportResult {
  const db = getDb()
  const target = calendarId ?? ensureDefaultCalendar().id
  const parsed = ical.sync.parseICS(text)
  let imported = 0
  let updated = 0
  let skipped = 0
  const now = Date.now()

  for (const key of Object.keys(parsed)) {
    const component = parsed[key] as { type?: string } & Record<string, unknown>
    if (component.type !== 'VEVENT') continue

    const start = component.start as Date | undefined
    const end = (component.end as Date | undefined) ?? start
    if (!start) {
      skipped += 1
      continue
    }
    const startUtc = start.getTime()
    const endUtc = end ? end.getTime() : startUtc + 60 * 60 * 1000
    const uid = (component.uid as string | undefined) ?? null
    const isAllDay = component.datetype === 'date'
    const exdates = extractExdate(component.exdate)

    const values = {
      calendarId: target,
      uid,
      sequence: Number(component.sequence ?? 0),
      summary: (component.summary as string | undefined) ?? null,
      description: (component.description as string | undefined) ?? null,
      location: (component.location as string | undefined) ?? null,
      startUtc,
      endUtc,
      isAllDay,
      status: (component.status as string | undefined) ?? null,
      organizer:
        typeof component.organizer === 'object' && component.organizer
          ? ((component.organizer as { val?: string }).val ?? null)
          : ((component.organizer as string | undefined) ?? null),
      rrule: extractRrule(component.rrule),
      exdate: exdates.length ? JSON.stringify(exdates) : null,
      updatedAt: now
    }

    const existing = uid
      ? db.select().from(calendarEvents).where(eq(calendarEvents.uid, uid)).get()
      : undefined

    let eventId: string
    if (existing) {
      db.update(calendarEvents).set(values).where(eq(calendarEvents.id, existing.id)).run()
      eventId = existing.id
      updated += 1
    } else {
      eventId = randomUUID()
      db.insert(calendarEvents).values({ id: eventId, createdAt: now, ...values }).run()
      imported += 1
    }

    db.delete(calendarEventAttendees).where(eq(calendarEventAttendees.eventId, eventId)).run()
    for (const attendee of extractAttendees(component.attendee)) {
      db.insert(calendarEventAttendees)
        .values({
          id: randomUUID(),
          eventId,
          email: attendee.email,
          name: attendee.name,
          partstat: attendee.partstat
        })
        .run()
    }
  }

  return { imported, updated, skipped }
}

export function importFromFile(filePath: string, calendarId?: string): ImportResult {
  const text = readFileSync(filePath, 'utf8')
  return importIcsText(text, calendarId)
}

export function importFromAttachment(attachmentId: string): ImportResult {
  const row = getDb().select().from(attachments).where(eq(attachments.id, attachmentId)).get()
  if (!row || !row.contentPath) return { imported: 0, updated: 0, skipped: 0 }
  const text = readFileSync(attachmentAbsolutePath(row.contentPath), 'utf8')
  return importIcsText(text)
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function formatIcsDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

function escapeIcs(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

export function buildIcs(calendarId?: string, startUtc?: number, endUtc?: number): string {
  const db = getDb()
  const rows = calendarId
    ? db.select().from(calendarEvents).where(eq(calendarEvents.calendarId, calendarId)).all()
    : db.select().from(calendarEvents).all()

  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Clover Mail//EN', 'CALSCALE:GREGORIAN']
  for (const ev of rows) {
    if (startUtc !== undefined && endUtc !== undefined && (ev.startUtc >= endUtc || ev.endUtc <= startUtc)) {
      continue
    }
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${ev.uid ?? ev.id}`)
    lines.push(`DTSTAMP:${formatIcsDate(Date.now())}`)
    lines.push(`DTSTART:${formatIcsDate(ev.startUtc)}`)
    lines.push(`DTEND:${formatIcsDate(ev.endUtc)}`)
    if (ev.summary) lines.push(`SUMMARY:${escapeIcs(ev.summary)}`)
    if (ev.location) lines.push(`LOCATION:${escapeIcs(ev.location)}`)
    if (ev.description) lines.push(`DESCRIPTION:${escapeIcs(ev.description)}`)
    if (ev.rrule) lines.push(`RRULE:${ev.rrule}`)
    if (ev.status) lines.push(`STATUS:${ev.status}`)
    for (const attendee of attendeesFor(ev.id)) {
      if (attendee.email) lines.push(`ATTENDEE:mailto:${attendee.email}`)
    }
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

export async function exportIcs(
  calendarId?: string
): Promise<{ saved: boolean; path?: string }> {
  const result = await platform().showSaveDialog('clover-calendar.ics')
  if (result.canceled || !result.filePath) return { saved: false }
  writeFileSync(result.filePath, buildIcs(calendarId), 'utf8')
  return { saved: true, path: result.filePath }
}

export async function pickAndImport(calendarId?: string): Promise<ImportResult | null> {
  const result = await platform().showOpenDialog({
    title: 'Import .ics',
    filters: [{ name: 'Calendar', extensions: ['ics', 'ical', 'ifb'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return importFromFile(result.filePaths[0], calendarId)
}
