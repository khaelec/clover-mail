import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { formatAddress, isValidEmail, parseAddress, splitAddresses } from '@shared/addresses'
import type { ContactSuggestion } from '@shared/contacts'

function join(entries: string[], draft: string): string {
  return [...entries, draft].filter((e) => e.trim()).join(', ')
}

/**
 * Split the field's value into finished recipients (shown as chips) and the text
 * still being typed. `draft` is what the input last produced: while the value
 * still ends with it, it stays editable; anything else (a reply's prefilled
 * address, a pasted list) is all chips.
 */
function decompose(value: string, draft: string): { entries: string[]; draft: string } {
  const all = splitAddresses(value)
  const pending = draft.trim()
  if (pending && !/[,;]\s*$/.test(value) && all[all.length - 1] === pending) {
    return { entries: all.slice(0, -1), draft }
  }
  return { entries: all, draft: '' }
}

/**
 * A To/Cc/Bcc field with address-book autocomplete, Outlook style: finished
 * recipients become chips (red if the address is invalid), Backspace removes
 * the last one, and double-clicking a chip edits it. The value stays a plain
 * comma-separated string, so drafts and sending are unchanged.
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
  const draftRef = useRef('')
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([])
  const [highlight, setHighlight] = useState(0)
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestId = useRef(0)

  const { entries, draft } = decompose(value, draftRef.current)
  draftRef.current = draft

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  function emit(nextEntries: string[], nextDraft: string): void {
    draftRef.current = nextDraft
    onChange(join(nextEntries, nextDraft))
  }

  function closeList(): void {
    if (timer.current) clearTimeout(timer.current)
    requestId.current += 1
    setOpen(false)
  }

  function lookup(text: string, current: string[]): void {
    if (timer.current) clearTimeout(timer.current)
    const token = text.trim().replace(/^["'<]+/, '')
    if (!token) {
      closeList()
      return
    }
    // Don't offer people already in the field.
    const present = new Set(current.map((e) => parseAddress(e)?.email.toLowerCase()).filter(Boolean))
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

  function onType(text: string): void {
    // A typed or pasted separator finishes everything before it.
    if (/[,;]/.test(text)) {
      const parts = splitAddresses(text)
      const endsWithSep = /[,;]\s*$/.test(text)
      const finished = endsWithSep ? parts : parts.slice(0, -1)
      const rest = endsWithSep ? '' : (parts[parts.length - 1] ?? '')
      const next = [...entries, ...finished]
      emit(next, rest)
      lookup(rest, next)
      return
    }
    emit(entries, text)
    lookup(text, entries)
  }

  function commitDraft(): void {
    if (!draft.trim()) return
    emit([...entries, ...splitAddresses(draft)], '')
  }

  function pick(s: ContactSuggestion): void {
    if (s.group) {
      // A group adds each member (skipping anyone already in the field).
      const present = new Set(entries.map((e) => parseAddress(e)?.email.toLowerCase()))
      const added = s.group.members.filter((m) => !present.has(parseAddress(m)?.email.toLowerCase()))
      emit([...entries, ...added], '')
    } else {
      emit([...entries, formatAddress(s.name, s.email)], '')
    }
    closeList()
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function removeAt(index: number): void {
    emit(
      entries.filter((_, i) => i !== index),
      draft
    )
    inputRef.current?.focus()
  }

  function editAt(index: number): void {
    const text = entries[index]
    emit(
      entries.filter((_, i) => i !== index),
      text
    )
    requestAnimationFrame(() => {
      const input = inputRef.current
      input?.focus()
      input?.setSelectionRange(text.length, text.length)
    })
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (open && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlight((h) => (h + 1) % suggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        pick(suggestions[highlight] ?? suggestions[0])
        return
      }
      if (e.key === 'Escape') {
        // Close the list, not the compose window.
        e.preventDefault()
        e.stopPropagation()
        closeList()
        return
      }
    }
    if (e.key === 'Enter' && draft.trim()) {
      e.preventDefault()
      commitDraft()
    } else if (e.key === 'Backspace' && !draft && entries.length > 0) {
      e.preventDefault()
      removeAt(entries.length - 1)
    }
  }

  return (
    <div
      className="relative flex min-w-0 flex-1 flex-wrap items-center gap-1"
      onMouseDown={(e) => {
        // Clicking the empty part of the field focuses the input.
        if (e.target === e.currentTarget) {
          e.preventDefault()
          inputRef.current?.focus()
        }
      }}
    >
      {entries.map((entry, i) => {
        const parsed = parseAddress(entry)
        const valid = !!parsed && isValidEmail(parsed.email)
        return (
          <span
            key={`${i}:${entry}`}
            title={valid ? entry : `${entry} — not a valid address (double-click to fix)`}
            onDoubleClick={() => editAt(i)}
            className={
              'flex max-w-[260px] items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1 text-[12px] ' +
              (valid ? 'bg-accent/15 text-ink' : 'bg-red-500/15 text-red-500')
            }
          >
            <span className="truncate">{parsed?.name || parsed?.email || entry}</span>
            <button
              type="button"
              aria-label={`Remove ${parsed?.email ?? entry}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => removeAt(i)}
              className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-[13px] leading-none text-muted hover:bg-black/10 hover:text-ink dark:hover:bg-white/15"
            >
              ×
            </button>
          </span>
        )
      })}
      <input
        ref={inputRef}
        value={draft}
        autoFocus={autoFocus}
        placeholder={entries.length === 0 ? placeholder : undefined}
        spellCheck={false}
        autoComplete="off"
        aria-label="Recipients"
        onChange={(e) => onType(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          closeList()
          // Like Outlook: leaving the field turns what was typed into a recipient.
          commitDraft()
        }}
        className="min-w-[120px] flex-1 bg-transparent py-0.5 text-[13px] text-ink outline-none"
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
                {s.group ? (
                  <span className="block truncate text-[11.5px] text-muted">
                    Group · {s.group.members.length} {s.group.members.length === 1 ? 'person' : 'people'}
                  </span>
                ) : (
                  s.name && <span className="block truncate text-[11.5px] text-muted">{s.email}</span>
                )}
              </span>
              {s.isSaved && !s.group && <span className="shrink-0 text-[10.5px] text-muted">Contact</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
