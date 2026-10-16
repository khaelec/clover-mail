import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { formatAddress, parseAddress, splitAddresses } from '@shared/addresses'
import type { ContactSuggestion } from '@shared/contacts'

/**
 * The entry being typed: from the separator before the caret to the next one.
 * Text typed straight after a completed `Name <email>` (no comma yet) counts as
 * a new entry.
 */
function activeToken(value: string, caret: number): { start: number; end: number; text: string } {
  let start = caret
  while (start > 0 && value[start - 1] !== ',' && value[start - 1] !== ';' && value[start - 1] !== '>') {
    start -= 1
  }
  let end = caret
  while (end < value.length && value[end] !== ',' && value[end] !== ';') end += 1
  return { start, end, text: value.slice(start, end).trim() }
}

/**
 * A To/Cc/Bcc field with address-book autocomplete. The value stays a plain
 * comma-separated string; picking a suggestion replaces the entry being typed
 * with `Name <email>, `.
 */
export function RecipientInput({
  value,
  onChange,
  placeholder,
  autoFocus
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoFocus?: boolean
}): ReactNode {
  const inputRef = useRef<HTMLInputElement>(null)
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([])
  const [highlight, setHighlight] = useState(0)
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestId = useRef(0)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  function lookup(next: string, caret: number): void {
    if (timer.current) clearTimeout(timer.current)
    const { start, end, text: token } = activeToken(next, caret)
    // Don't offer people already in the field.
    const present = new Set(
      splitAddresses(next.slice(0, start) + next.slice(end))
        .map((entry) => parseAddress(entry)?.email.toLowerCase())
        .filter(Boolean)
    )
    if (!token) {
      setOpen(false)
      return
    }
    timer.current = setTimeout(() => {
      const id = ++requestId.current
      void window.clover.contacts
        .suggest(token, 12)
        .then((all) => {
          if (id !== requestId.current) return
          const list = all.filter((s) => !present.has(s.email)).slice(0, 8)
          // Hide the list if it would only repeat exactly what's typed.
          const exact = list.length === 1 && list[0].email === token.toLowerCase()
          setSuggestions(list)
          setHighlight(0)
          setOpen(list.length > 0 && !exact)
        })
        .catch(() => setOpen(false))
    }, 120)
  }

  function pick(s: ContactSuggestion): void {
    const input = inputRef.current
    const caret = input?.selectionStart ?? value.length
    const { start, end } = activeToken(value, caret)
    const before = value.slice(0, start).replace(/\s*$/, '')
    const after = value.slice(end).replace(/^[,;]\s*/, '')
    const prefix = !before ? '' : /[,;]$/.test(before) ? `${before} ` : `${before}, `
    const inserted = `${formatAddress(s.name, s.email)}, `
    const next = `${prefix}${inserted}${after}`
    onChange(next)
    setOpen(false)
    requestId.current += 1
    const pos = prefix.length + inserted.length
    requestAnimationFrame(() => {
      input?.focus()
      input?.setSelectionRange(pos, pos)
    })
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => (h + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      pick(suggestions[highlight] ?? suggestions[0])
    } else if (e.key === 'Escape') {
      // Close the list, not the compose window.
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
    }
  }

  return (
    <div className="relative flex-1">
      <input
        ref={inputRef}
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value)
          lookup(e.target.value, e.target.selectionStart ?? e.target.value.length)
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
        className="w-full bg-transparent text-[13px] text-ink outline-none"
      />
      {open && suggestions.length > 0 && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1.5 max-h-72 w-full min-w-[280px] max-w-[460px] overflow-y-auto rounded-xl border border-line bg-surface py-1 text-ink shadow-2xl"
        >
          {suggestions.map((s, i) => (
            <button
              key={s.email}
              type="button"
              role="option"
              aria-selected={i === highlight}
              // mousedown, not click: the input's blur would close the list first.
              onMouseDown={(e) => {
                e.preventDefault()
                pick(s)
              }}
              onMouseEnter={() => setHighlight(i)}
              className={
                'flex w-full items-center gap-2.5 px-3 py-1.5 text-left ' +
                (i === highlight ? 'bg-accent/15' : '')
              }
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/20 text-[11px] font-semibold text-accent">
                {(s.name || s.email).slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium">{s.name || s.email}</span>
                {s.name && <span className="block truncate text-[11.5px] text-muted">{s.email}</span>}
              </span>
              {s.isSaved && <span className="shrink-0 text-[10.5px] text-muted">Contact</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
