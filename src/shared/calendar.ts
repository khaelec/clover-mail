export interface Calendar {
  id: string
  accountId: string | null
  name: string
  color: string
  isVisible: boolean
}

export interface AttendeeLite {
  email: string | null
  name: string | null
  partstat: string | null
}

export interface CalendarEvent {
  id: string
  calendarId: string
  uid: string | null
  summary: string | null
  description: string | null
  location: string | null
  startUtc: number
  endUtc: number
  isAllDay: boolean
  rrule: string | null
  status: string | null
  organizer: string | null
  isRecurring: boolean
  attendees: AttendeeLite[]
}

export interface Occurrence {
  eventId: string
  calendarId: string
  summary: string | null
  location: string | null
  startUtc: number
  endUtc: number
  isAllDay: boolean
  isRecurring: boolean
}

export interface EventInput {
  calendarId: string
  summary: string
  description?: string
  location?: string
  startUtc: number
  endUtc: number
  isAllDay?: boolean
  rrule?: string | null
}

export interface ImportResult {
  imported: number
  updated: number
  skipped: number
}
