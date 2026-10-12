import { create } from 'zustand'
import type { Calendar, EventInput, Occurrence } from '@shared/calendar'

export type CalendarViewMode = 'month' | 'week' | 'agenda'

interface CalendarState {
  calendars: Calendar[]
  occurrences: Occurrence[]
  view: CalendarViewMode
  anchor: number
  notice: string | null
  load: () => Promise<void>
  refresh: () => Promise<void>
  setView: (view: CalendarViewMode) => void
  setAnchor: (anchor: number) => void
  goToday: () => void
  move: (delta: number) => void
  createEvent: (input: EventInput) => Promise<void>
  updateEvent: (id: string, input: EventInput) => Promise<void>
  deleteEvent: (id: string) => Promise<void>
  importFile: (path: string) => Promise<void>
  pickAndImport: () => Promise<void>
  exportIcs: () => Promise<void>
  setNotice: (notice: string | null) => void
}

export function rangeFor(view: CalendarViewMode, anchor: number): { start: number; end: number } {
  const d = new Date(anchor)
  if (view === 'month') {
    const first = new Date(d.getFullYear(), d.getMonth(), 1)
    const start = new Date(first)
    start.setDate(first.getDate() - first.getDay())
    const end = new Date(start)
    end.setDate(start.getDate() + 42)
    return { start: start.getTime(), end: end.getTime() }
  }
  if (view === 'week') {
    const start = new Date(d)
    start.setDate(d.getDate() - d.getDay())
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(start.getDate() + 7)
    return { start: start.getTime(), end: end.getTime() }
  }
  const start = new Date(d)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(start.getDate() + 30)
  return { start: start.getTime(), end: end.getTime() }
}

export const useCalendar = create<CalendarState>((set, get) => ({
  calendars: [],
  occurrences: [],
  view: 'month',
  anchor: Date.now(),
  notice: null,

  load: async () => {
    const calendars = await window.clover.calendar.listCalendars()
    set({ calendars })
    await get().refresh()
  },

  refresh: async () => {
    const { view, anchor } = get()
    const { start, end } = rangeFor(view, anchor)
    const occurrences = await window.clover.calendar.listOccurrences(start, end)
    set({ occurrences })
  },

  setView: (view) => {
    set({ view })
    void get().refresh()
  },

  setAnchor: (anchor) => {
    set({ anchor })
    void get().refresh()
  },

  goToday: () => {
    set({ anchor: Date.now() })
    void get().refresh()
  },

  move: (delta) => {
    const { view, anchor } = get()
    const d = new Date(anchor)
    if (view === 'month') d.setMonth(d.getMonth() + delta)
    else if (view === 'week') d.setDate(d.getDate() + delta * 7)
    else d.setDate(d.getDate() + delta * 30)
    set({ anchor: d.getTime() })
    void get().refresh()
  },

  createEvent: async (input) => {
    await window.clover.calendar.createEvent(input)
    await get().refresh()
  },

  updateEvent: async (id, input) => {
    await window.clover.calendar.updateEvent(id, input)
    await get().refresh()
  },

  deleteEvent: async (id) => {
    await window.clover.calendar.deleteEvent(id)
    await get().refresh()
  },

  importFile: async (path) => {
    const result = await window.clover.calendar.importPath(path)
    set({ notice: `Imported ${result.imported}, updated ${result.updated}, skipped ${result.skipped}.` })
    await get().refresh()
  },

  pickAndImport: async () => {
    const result = await window.clover.calendar.pickAndImport()
    if (result) {
      set({ notice: `Imported ${result.imported}, updated ${result.updated}, skipped ${result.skipped}.` })
      await get().refresh()
    }
  },

  exportIcs: async () => {
    const result = await window.clover.calendar.exportIcs()
    if (result.saved) set({ notice: `Exported to ${result.path}` })
  },

  setNotice: (notice) => set({ notice })
}))
