import { useEffect, useRef, useState, type ReactNode } from 'react'
import { fieldsToSearch, searchToFields, type SearchFields } from '@shared/search'
import { useMail } from '../state/mail'

const inputClass =
  'w-full min-w-0 rounded-md border border-line bg-canvas/60 px-2 py-1 text-[13px] text-ink outline-none focus:border-accent'

/**
 * The search filters panel (like Outlook's): fills in the search box with
 * from:, has:attachment, dates and so on, so nobody has to know the operators.
 */
export function SearchFilters({
  query,
  onSearch,
  onClose
}: {
  query: string
  onSearch: (query: string) => void
  onClose: () => void
}): ReactNode {
  const folders = useMail((s) => s.folders)
  const [fields, setFields] = useState<SearchFields>(() => searchToFields(query))
  const panelRef = useRef<HTMLFormElement>(null)
  const set = (patch: Partial<SearchFields>): void => setFields((f) => ({ ...f, ...patch }))

  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    panelRef.current?.querySelector<HTMLInputElement>('input')?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const folderNames = [...new Set(folders.filter((f) => f.isVisible).map((f) => f.name))]
  const text = (label: string, key: 'keywords' | 'from' | 'to' | 'subject', placeholder = ''): ReactNode => (
    <label className="grid grid-cols-[84px_1fr] items-center gap-2">
      <span className="text-[12px] text-muted">{label}</span>
      <input
        value={fields[key]}
        placeholder={placeholder}
        onChange={(e) => set({ [key]: e.target.value })}
        className={inputClass}
      />
    </label>
  )
  const check = (label: string, key: 'hasAttachment' | 'unread' | 'flagged'): ReactNode => (
    <label className="flex items-center gap-1.5 text-[12px] text-ink">
      <input type="checkbox" checked={fields[key]} onChange={(e) => set({ [key]: e.target.checked })} />
      {label}
    </label>
  )

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <form
        ref={panelRef}
        role="dialog"
        aria-label="Search filters"
        onSubmit={(e) => {
          e.preventDefault()
          onSearch(fieldsToSearch(fields))
          onClose()
        }}
        className="absolute left-3 right-3 top-full z-50 mt-1 max-w-md space-y-2 rounded-xl border border-line bg-surface p-4 shadow-2xl"
      >
        {text('Keywords', 'keywords', 'Words in the message')}
        {text('From', 'from', 'Name or address')}
        {text('To', 'to', 'Name or address')}
        {text('Subject', 'subject')}
        <label className="grid grid-cols-[84px_1fr] items-center gap-2">
          <span className="text-[12px] text-muted">Folder</span>
          <select value={fields.folder} onChange={(e) => set({ folder: e.target.value })} className={inputClass}>
            <option value="">All folders</option>
            {fields.folder && !folderNames.includes(fields.folder) && (
              <option value={fields.folder}>{fields.folder}</option>
            )}
            {folderNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid grid-cols-[84px_1fr] items-center gap-2">
          <span className="text-[12px] text-muted">Received from</span>
          <input
            type="date"
            value={fields.fromDate}
            onChange={(e) => set({ fromDate: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="grid grid-cols-[84px_1fr] items-center gap-2">
          <span className="text-[12px] text-muted">Received to</span>
          <input
            type="date"
            value={fields.toDate}
            onChange={(e) => set({ toDate: e.target.value })}
            className={inputClass}
          />
        </label>
        <div className="flex flex-wrap gap-x-4 gap-y-1 pl-[92px]">
          {check('Has attachments', 'hasAttachment')}
          {check('Unread', 'unread')}
          {check('Flagged', 'flagged')}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              onSearch('')
              onClose()
            }}
            className="rounded-lg px-3 py-1.5 text-[12px] text-muted hover:text-ink"
          >
            Clear
          </button>
          <button type="submit" className="rounded-lg bg-accent px-4 py-1.5 text-[12px] font-semibold text-accent-ink">
            Search
          </button>
        </div>
      </form>
    </>
  )
}
