import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useCalendar, rangeFor, type CalendarViewMode } from '../state/calendar'
import type { Occurrence } from '@shared/calendar'
import { EventModal, type EventDraft } from './EventModal'
import { IconCalendar, IconPlus } from './icons'

function dayKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function addDays(ms: number, days: number): number {
  const d = new Date(ms)
  d.setDate(d.getDate() + days)
  return d.getTime()
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function CalendarView(): ReactNode {
  const calendars = useCalendar((s) => s.calendars)
  const occurrences = useCalendar((s) => s.occurrences)
  const view = useCalendar((s) => s.view)
  const anchor = useCalendar((s) => s.anchor)
  const notice = useCalendar((s) => s.notice)
  const load = useCalendar((s) => s.load)
  const refresh = useCalendar((s) => s.refresh)
  const setView = useCalendar((s) => s.setView)
  const move = useCalendar((s) => s.move)
  const goToday = useCalendar((s) => s.goToday)
  const pickAndImport = useCalendar((s) => s.pickAndImport)
  const importFile = useCalendar((s) => s.importFile)
  const exportIcs = useCalendar((s) => s.exportIcs)
  const setNotice = useCalendar((s) => s.setNotice)
  const moveTo = useCalendar((s) => s.setAnchor)

  const [draft, setDraft] = useState<EventDraft | null>(null)

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const colorFor = useMemo(() => {
    const map = new Map(calendars.map((c) => [c.id, c.color]))
    const fallback = calendars[0]?.color ?? '#10b981'
    return (calendarId: string): string => map.get(calendarId) ?? fallback
  }, [calendars])

  const byDay = useMemo(() => {
    const map = new Map<string, Occurrence[]>()
    for (const occ of occurrences) {
      const key = dayKey(occ.startUtc)
      const list = map.get(key) ?? []
      list.push(occ)
      map.set(key, list)
    }
    return map
  }, [occurrences])

  const title = useMemo(() => {
    const d = new Date(anchor)
    if (view === 'month') return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    if (view === 'week') {
      const { start } = rangeFor('week', anchor)
      const s = new Date(start)
      const e = new Date(addDays(start, 6))
      return `${s.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
    }
    return 'Next 30 days'
  }, [view, anchor])

  function openCreate(dayMs: number): void {
    const base = new Date(dayMs)
    base.setHours(9, 0, 0, 0)
    setDraft({
      calendarId: calendars[0]?.id ?? '',
      summary: '',
      description: '',
      location: '',
      startUtc: base.getTime(),
      endUtc: base.getTime() + 60 * 60 * 1000,
      isAllDay: false
    })
  }

  async function openEdit(eventId: string): Promise<void> {
    const event = await window.clover.calendar.getEvent(eventId)
    if (!event) return
    setDraft({
      id: event.id,
      calendarId: event.calendarId,
      summary: event.summary ?? '',
      description: event.description ?? '',
      location: event.location ?? '',
      startUtc: event.startUtc,
      endUtc: event.endUtc,
      isAllDay: event.isAllDay
    })
  }

  const monthDays = useMemo(() => {
    const { start } = rangeFor('month', anchor)
    return Array.from({ length: 42 }, (_, i) => addDays(start, i))
  }, [anchor])

  const todayKey = dayKey(Date.now())
  const viewModes: CalendarViewMode[] = ['month', 'week', 'agenda']

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        for (const file of Array.from(e.dataTransfer.files)) {
          const path = window.clover.getFilePath(file)
          if (path) void importFile(path)
        }
      }}
    >
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <IconCalendar className="h-5 w-5 text-accent" />
        <h1 className="text-[15px] font-semibold text-ink">{title}</h1>
        <div className="ml-2 flex items-center gap-1">
          <button type="button" onClick={() => move(-1)} className="rounded-md px-2 py-1 text-[13px] text-muted hover:text-ink">
            ‹
          </button>
          <button type="button" onClick={goToday} className="rounded-md border border-line px-2.5 py-1 text-[12px] text-muted hover:text-ink">
            Today
          </button>
          <button type="button" onClick={() => move(1)} className="rounded-md px-2 py-1 text-[13px] text-muted hover:text-ink">
            ›
          </button>
        </div>

        <div className="ml-3 flex rounded-lg border border-line p-0.5">
          {viewModes.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              className={
                'rounded-md px-2.5 py-1 text-[12px] capitalize ' +
                (view === mode ? 'bg-accent/12 text-accent' : 'text-muted hover:text-ink')
              }
            >
              {mode}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => void pickAndImport()}
            className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-muted hover:text-accent"
          >
            Import .ics
          </button>
          <button
            type="button"
            onClick={() => void exportIcs()}
            className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-muted hover:text-accent"
          >
            Export
          </button>
          <button
            type="button"
            onClick={() => openCreate(Date.now())}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-accent-ink"
          >
            <IconPlus className="h-3.5 w-3.5" />
            New event
          </button>
        </div>
      </header>

      {notice && (
        <div className="flex items-center justify-between border-b border-line bg-accent/8 px-4 py-1.5 text-[12px] text-accent">
          {notice}
          <button type="button" onClick={() => setNotice(null)} className="text-muted hover:text-ink">
            dismiss
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {view === 'month' && (
          <div className="grid grid-cols-7 border-l border-t border-line">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="border-b border-r border-line bg-canvas/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                {d}
              </div>
            ))}
            {monthDays.map((day) => {
              const key = dayKey(day)
              const inMonth = new Date(day).getMonth() === new Date(anchor).getMonth()
              const dayEvents = byDay.get(key) ?? []
              return (
                <div
                  key={day}
                  onClick={() => openCreate(day)}
                  className={
                    'min-h-[104px] cursor-pointer border-b border-r border-line p-1.5 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03] ' +
                    (inMonth ? '' : 'bg-canvas/30')
                  }
                >
                  <div
                    className={
                      'mb-1 inline-grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] ' +
                      (key === todayKey ? 'bg-accent text-accent-ink' : inMonth ? 'text-ink' : 'text-muted')
                    }
                  >
                    {new Date(day).getDate()}
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map((occ, i) => (
                      <button
                        key={`${occ.eventId}-${i}`}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          void openEdit(occ.eventId)
                        }}
                        className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px]"
                        style={{ backgroundColor: `${colorFor(occ.calendarId)}22`, color: 'var(--ink)' }}
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: colorFor(occ.calendarId) }} />
                        <span className="truncate">{occ.summary || '(no title)'}</span>
                      </button>
                    ))}
                    {dayEvents.length > 3 && (
                      <div className="px-1 text-[10px] text-muted">+{dayEvents.length - 3} more</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {view === 'week' && (
          <div className="divide-y divide-line">
            {Array.from({ length: 7 }, (_, i) => addDays(rangeFor('week', anchor).start, i)).map((day) => {
              const key = dayKey(day)
              const dayEvents = byDay.get(key) ?? []
              return (
                <div key={day} className="flex gap-4 px-5 py-3">
                  <div className="w-28 shrink-0">
                    <div className={'text-[13px] font-medium ' + (key === todayKey ? 'text-accent' : 'text-ink')}>
                      {new Date(day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                  <div className="flex-1 space-y-1">
                    {dayEvents.length === 0 && <div className="text-[12px] text-muted">—</div>}
                    {dayEvents.map((occ, i) => (
                      <button
                        key={`${occ.eventId}-${i}`}
                        type="button"
                        onClick={() => void openEdit(occ.eventId)}
                        className="flex w-full items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-left text-[12px] hover:border-accent"
                      >
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorFor(occ.calendarId) }} />
                        {!occ.isAllDay && <span className="text-muted">{formatTime(occ.startUtc)}</span>}
                        <span className="text-ink">{occ.summary || '(no title)'}</span>
                        {occ.isRecurring && <span className="text-[10px] text-muted">↻</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {view === 'agenda' && (
          <div className="divide-y divide-line">
            {occurrences.length === 0 && <div className="px-5 py-8 text-center text-[13px] text-muted">No events in range.</div>}
            {occurrences.map((occ, i) => (
              <button
                key={`${occ.eventId}-${i}`}
                type="button"
                onClick={() => void openEdit(occ.eventId)}
                className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
              >
                <div className="w-16 shrink-0 text-[12px] text-muted">
                  {new Date(occ.startUtc).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </div>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colorFor(occ.calendarId) }} />
                <div className="min-w-0">
                  <div className="truncate text-[13px] text-ink">{occ.summary || '(no title)'}</div>
                  <div className="text-[11px] text-muted">
                    {occ.isAllDay ? 'All day' : `${formatTime(occ.startUtc)} – ${formatTime(occ.endUtc)}`}
                    {occ.location ? ` · ${occ.location}` : ''}
                  </div>
                </div>
                {occ.isRecurring && <span className="ml-auto text-[10px] text-muted">↻</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {draft && calendars.length > 0 && (
        <EventModal draft={draft} calendars={calendars} onClose={() => setDraft(null)} />
      )}
    </div>
  )
}
