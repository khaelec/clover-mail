import { useRef, useState, type ReactNode } from 'react'
import { useCalendar } from '../state/calendar'
import { useFocusTrap } from '../lib/useFocusTrap'
import type { Calendar, EventInput } from '@shared/calendar'
import { IconClose, IconTrash } from './icons'

export interface EventDraft {
  id?: string
  calendarId: string
  summary: string
  description: string
  location: string
  startUtc: number
  endUtc: number
  isAllDay: boolean
}

function toLocalInput(ms: number): string {
  const d = new Date(ms)
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function fromLocalInput(value: string): number {
  return new Date(value).getTime()
}

export function EventModal({
  draft,
  calendars,
  onClose
}: {
  draft: EventDraft
  calendars: Calendar[]
  onClose: () => void
}): ReactNode {
  const createEvent = useCalendar((s) => s.createEvent)
  const updateEvent = useCalendar((s) => s.updateEvent)
  const deleteEvent = useCalendar((s) => s.deleteEvent)

  const [summary, setSummary] = useState(draft.summary)
  const [location, setLocation] = useState(draft.location)
  const [description, setDescription] = useState(draft.description)
  const [calendarId, setCalendarId] = useState(draft.calendarId || calendars[0]?.id || '')
  const [start, setStart] = useState(toLocalInput(draft.startUtc))
  const [end, setEnd] = useState(toLocalInput(draft.endUtc))
  const [isAllDay, setIsAllDay] = useState(draft.isAllDay)
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(dialogRef, onClose)

  async function save(): Promise<void> {
    const input: EventInput = {
      calendarId,
      summary: summary.trim() || '(no title)',
      description: description.trim() || undefined,
      location: location.trim() || undefined,
      startUtc: fromLocalInput(start),
      endUtc: fromLocalInput(end),
      isAllDay
    }
    if (draft.id) await updateEvent(draft.id, input)
    else await createEvent(input)
    onClose()
  }

  async function remove(): Promise<void> {
    if (draft.id) await deleteEvent(draft.id)
    onClose()
  }

  const fieldClass =
    'w-full rounded-lg border border-line bg-canvas/60 px-3 py-2 text-[13px] text-ink outline-none focus:border-accent'

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={draft.id ? 'Edit event' : 'New event'}
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm"
    >
      <div className="animate-fade-in w-full max-w-md overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-[14px] font-semibold text-ink">{draft.id ? 'Edit event' : 'New event'}</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/10"
          >
            <IconClose />
          </button>
        </header>

        <div className="space-y-3 px-5 py-4">
          <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Title" className={fieldClass} autoFocus />
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] text-muted">Starts</span>
              <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className={fieldClass} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-muted">Ends</span>
              <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className={fieldClass} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-[12px] text-muted">
            <input type="checkbox" checked={isAllDay} onChange={(e) => setIsAllDay(e.target.checked)} />
            All day
          </label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location" className={fieldClass} />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Notes"
            className={fieldClass + ' min-h-[70px] resize-none'}
          />
          <label className="block">
            <span className="mb-1 block text-[11px] text-muted">Calendar</span>
            <select value={calendarId} onChange={(e) => setCalendarId(e.target.value)} className={fieldClass}>
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <footer className="flex items-center gap-2 border-t border-line px-5 py-3">
          {draft.id && (
            <button
              type="button"
              onClick={remove}
              className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[12px] text-muted hover:text-rose-500"
            >
              <IconTrash className="h-3.5 w-3.5" />
              Delete
            </button>
          )}
          <button type="button" onClick={onClose} className="ml-auto rounded-lg px-3.5 py-2 text-[13px] text-muted hover:text-ink">
            Cancel
          </button>
          <button type="button" onClick={save} className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink">
            Save
          </button>
        </footer>
      </div>
    </div>
  )
}
