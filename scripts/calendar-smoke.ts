import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeDatabase, initDatabase } from '../src/core/db'
import { buildIcs, importIcsText, listCalendars, listOccurrences } from '../src/main/calendar'

const dir = mkdtempSync(join(tmpdir(), 'clover-cal-'))
initDatabase(dir)

const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//test//EN',
  'BEGIN:VEVENT',
  'UID:standup@test',
  'SUMMARY:Daily standup',
  'DTSTART:20260101T090000Z',
  'DTEND:20260101T091500Z',
  'RRULE:FREQ=DAILY;COUNT=5',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:launch@test',
  'SUMMARY:Product launch',
  'DTSTART:20260115T140000Z',
  'DTEND:20260115T150000Z',
  'END:VEVENT',
  'END:VCALENDAR'
].join('\r\n')

const result = importIcsText(ICS)
const calendars = listCalendars()

const start = Date.UTC(2026, 0, 1)
const end = Date.UTC(2026, 1, 1)
const occurrences = listOccurrences(start, end)

const icsOut = buildIcs()
const hasHeader = icsOut.includes('BEGIN:VCALENDAR') && icsOut.includes('END:VCALENDAR')
const hasSummary = icsOut.includes('SUMMARY:Daily standup')
const hasRrule = icsOut.includes('RRULE:FREQ=DAILY;COUNT=5')

console.log(
  JSON.stringify({
    imported: result.imported,
    calendars: calendars.length,
    occurrences: occurrences.length,
    recurring: occurrences.filter((o) => o.isRecurring).length,
    hasHeader,
    hasSummary,
    hasRrule
  })
)
closeDatabase()

const ok =
  result.imported === 2 &&
  calendars.length === 1 &&
  occurrences.length === 6 &&
  occurrences.filter((o) => o.isRecurring).length === 5 &&
  hasHeader &&
  hasSummary &&
  hasRrule
console.log(ok ? 'CALENDAR_SMOKE_OK' : 'CALENDAR_SMOKE_FAIL')
process.exit(ok ? 0 : 1)
