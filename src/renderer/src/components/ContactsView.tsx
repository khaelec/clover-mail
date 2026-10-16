import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { formatAddress } from '@shared/addresses'
import type { Contact, ContactInput } from '@shared/contacts'
import { openCompose } from '../state/compose'
import { useToasts } from '../state/toasts'
import { IconDownload, IconMail, IconPlus, IconSearch, IconTrash } from './icons'

type Scope = 'saved' | 'all'

const EMPTY: ContactInput = { email: '', name: '', company: '', phone: '', notes: '' }

function initials(c: { name: string | null; email: string }): string {
  const source = (c.name || c.email).trim()
  const parts = source.split(/\s+/).filter(Boolean)
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : source.slice(0, 2)
  return letters.toUpperCase()
}

function toast(message: string, kind: 'info' | 'error' = 'info'): void {
  useToasts.getState().push({ message, kind })
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  multiline,
  autoFocus
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  multiline?: boolean
  autoFocus?: boolean
}): ReactNode {
  const cls =
    'mt-1 w-full rounded-lg border border-line bg-canvas/60 px-3 py-2 text-[13px] text-ink outline-none focus:border-accent'
  return (
    <label className="block">
      <span className="text-[12px] text-muted">{label}</span>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={4} className={cls} />
      ) : (
        <input
          type={type}
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
        />
      )}
    </label>
  )
}

/** Address book: saved contacts, plus people learned from mail. */
export function ContactsView(): ReactNode {
  const [scope, setScope] = useState<Scope>('saved')
  const [query, setQuery] = useState('')
  const [list, setList] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // null = viewing; 'new' = adding; a contact id = editing that contact.
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<ContactInput>(EMPTY)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async (): Promise<void> => {
    try {
      setList(await window.clover.contacts.list(scope, query))
    } catch (error) {
      toast(`Couldn't load contacts: ${(error as Error).message}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [scope, query])

  useEffect(() => {
    const t = setTimeout(() => void reload(), query ? 150 : 0)
    return () => clearTimeout(t)
  }, [reload, query])

  const selected = useMemo(() => list.find((c) => c.id === selectedId) ?? null, [list, selectedId])

  function startNew(): void {
    setSelectedId(null)
    setForm(EMPTY)
    setEditing('new')
  }

  function startEdit(c: Contact): void {
    setForm({ email: c.email, name: c.name ?? '', company: c.company ?? '', phone: c.phone ?? '', notes: c.notes ?? '' })
    setEditing(c.id)
  }

  async function submit(): Promise<void> {
    setBusy(true)
    try {
      const saved = await window.clover.contacts.save(form, editing && editing !== 'new' ? editing : undefined)
      setEditing(null)
      setSelectedId(saved.id)
      if (scope === 'saved' || !query) await reload()
      else setQuery('')
      toast(editing === 'new' ? 'Contact added' : 'Contact saved')
    } catch (error) {
      toast((error as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function remove(c: Contact): Promise<void> {
    const label = c.name || c.email
    if (!window.confirm(`Remove ${label} from contacts and suggestions?`)) return
    await window.clover.contacts.remove(c.id)
    setSelectedId(null)
    setEditing(null)
    await reload()
    toast(`Removed ${label}`)
  }

  async function addLearned(c: Contact): Promise<void> {
    await window.clover.contacts.save({ email: c.email, name: c.name })
    await reload()
    toast(`Added ${c.name || c.email} to contacts`)
  }

  async function importFile(): Promise<void> {
    try {
      const result = await window.clover.contacts.importFile()
      if (!result) return
      toast(
        `Imported ${result.imported} new, updated ${result.updated}` +
          (result.skipped ? `, skipped ${result.skipped} without a valid address` : '')
      )
      setScope('saved')
      await reload()
    } catch (error) {
      toast(`Import failed: ${(error as Error).message}`, 'error')
    }
  }

  async function exportFile(): Promise<void> {
    try {
      const result = await window.clover.contacts.exportFile()
      if (result) toast(`Exported ${result.count} contact${result.count === 1 ? '' : 's'}`)
    } catch (error) {
      toast(`Export failed: ${(error as Error).message}`, 'error')
    }
  }

  return (
    <div className="flex h-full">
      <aside className="flex w-80 shrink-0 flex-col border-r border-line bg-surface/60 backdrop-blur-xl">
        <div className="space-y-2.5 border-b border-line p-3">
          <div className="flex items-center gap-2">
            <h1 className="text-[15px] font-semibold tracking-tight text-ink">People</h1>
            <button
              type="button"
              onClick={startNew}
              className="ml-auto flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-[12px] font-semibold text-accent-ink"
            >
              <IconPlus className="h-3.5 w-3.5" /> New contact
            </button>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas/60 px-2.5 py-1.5">
            <IconSearch className="h-4 w-4 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none"
            />
          </div>
          <div className="flex rounded-lg border border-line p-0.5 text-[12px]">
            {(
              [
                ['saved', 'Contacts'],
                ['all', 'Everyone you email']
              ] as [Scope, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setScope(id)}
                className={
                  'flex-1 rounded-md px-2 py-1 transition-colors ' +
                  (scope === id ? 'bg-accent/15 font-medium text-accent' : 'text-muted hover:text-ink')
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {!loading && list.length === 0 && (
            <p className="px-4 py-6 text-center text-[12.5px] leading-relaxed text-muted">
              {query
                ? 'No one matches that search.'
                : scope === 'saved'
                  ? 'No saved contacts yet. Add one, import a .vcf/.csv file, or pick people from "Everyone you email".'
                  : 'People you email will show up here.'}
            </p>
          )}
          {list.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setSelectedId(c.id)
                setEditing(null)
              }}
              className={
                'flex w-full items-center gap-2.5 px-3 py-2 text-left ' +
                (c.id === selectedId ? 'bg-accent/12' : 'hover:bg-black/5 dark:hover:bg-white/5')
              }
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/20 text-[11px] font-semibold text-accent">
                {initials(c)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-ink">{c.name || c.email}</span>
                <span className="block truncate text-[11.5px] text-muted">
                  {c.name ? c.email : c.company || ' '}
                </span>
              </span>
              {scope === 'all' && c.isSaved && <span className="text-[10.5px] text-muted">Contact</span>}
            </button>
          ))}
        </div>
        <div className="flex gap-2 border-t border-line p-3">
          <button
            type="button"
            onClick={() => void importFile()}
            className="flex-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-muted hover:text-ink"
          >
            Import…
          </button>
          <button
            type="button"
            onClick={() => void exportFile()}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-muted hover:text-ink"
          >
            <IconDownload className="h-3.5 w-3.5" /> Export
          </button>
        </div>
      </aside>

      <section className="min-w-0 flex-1 overflow-y-auto">
        {editing ? (
          <form
            className="mx-auto max-w-lg space-y-3 px-8 py-8"
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            <h2 className="pb-1 text-[16px] font-semibold text-ink">{editing === 'new' ? 'New contact' : 'Edit contact'}</h2>
            <Field label="Name" value={form.name ?? ''} onChange={(name) => setForm({ ...form, name })} autoFocus />
            <Field label="Email" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} />
            <Field label="Company" value={form.company ?? ''} onChange={(company) => setForm({ ...form, company })} />
            <Field label="Phone" value={form.phone ?? ''} onChange={(phone) => setForm({ ...form, phone })} />
            <Field label="Notes" value={form.notes ?? ''} onChange={(notes) => setForm({ ...form, notes })} multiline />
            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={busy || !form.email.trim()}
                className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg border border-line px-4 py-2 text-[13px] text-muted hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : selected ? (
          <div className="mx-auto max-w-lg px-8 py-8">
            <div className="flex items-center gap-4">
              <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-accent/60 text-[20px] font-semibold text-accent-ink">
                {initials(selected)}
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-[18px] font-semibold text-ink">{selected.name || selected.email}</h2>
                {selected.company && <p className="truncate text-[13px] text-muted">{selected.company}</p>}
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openCompose({ to: formatAddress(selected.name, selected.email) })}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-accent-ink"
              >
                <IconMail className="h-4 w-4" /> Email
              </button>
              {selected.isSaved ? (
                <button
                  type="button"
                  onClick={() => startEdit(selected)}
                  className="rounded-lg border border-line px-3 py-1.5 text-[12.5px] text-muted hover:text-ink"
                >
                  Edit
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void addLearned(selected)}
                  className="flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-[12.5px] text-muted hover:text-ink"
                >
                  <IconPlus className="h-3.5 w-3.5" /> Add to contacts
                </button>
              )}
              <button
                type="button"
                onClick={() => void remove(selected)}
                className="flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-[12.5px] text-muted hover:text-red-500"
              >
                <IconTrash className="h-3.5 w-3.5" /> Remove
              </button>
            </div>
            <dl className="mt-6 space-y-4 text-[13px]">
              <div>
                <dt className="text-[12px] text-muted">Email</dt>
                <dd className="mt-0.5 select-text text-ink">{selected.email}</dd>
              </div>
              {selected.phone && (
                <div>
                  <dt className="text-[12px] text-muted">Phone</dt>
                  <dd className="mt-0.5 select-text text-ink">{selected.phone}</dd>
                </div>
              )}
              {selected.notes && (
                <div>
                  <dt className="text-[12px] text-muted">Notes</dt>
                  <dd className="mt-0.5 select-text whitespace-pre-wrap text-ink">{selected.notes}</dd>
                </div>
              )}
              {(selected.sendCount > 0 || selected.recvCount > 0) && (
                <div>
                  <dt className="text-[12px] text-muted">History</dt>
                  <dd className="mt-0.5 text-ink">
                    {[
                      selected.sendCount > 0 && `You've emailed them ${selected.sendCount} time${selected.sendCount === 1 ? '' : 's'}`,
                      selected.recvCount > 0 && `${selected.recvCount} message${selected.recvCount === 1 ? '' : 's'} from them`
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    {selected.lastUsed ? ` · last ${new Date(selected.lastUsed).toLocaleDateString()}` : ''}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        ) : (
          <div className="grid h-full place-items-center p-8 text-center text-[13px] text-muted">
            Select someone to see their details, or add a new contact.
          </div>
        )}
      </section>
    </div>
  )
}
