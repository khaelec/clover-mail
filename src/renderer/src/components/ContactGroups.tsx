import { useEffect, useState, type ReactNode } from 'react'
import { create } from 'zustand'
import { formatAddress } from '@shared/addresses'
import type { Contact, ContactGroup } from '@shared/contacts'
import { openCompose } from '../state/compose'
import { useToasts } from '../state/toasts'
import { IconMail, IconPeople, IconTrash } from './icons'

function toast(message: string, kind: 'info' | 'error' = 'info'): void {
  useToasts.getState().push({ message, kind })
}

function initials(c: { name: string | null; email: string }): string {
  const source = (c.name || c.email).trim()
  const parts = source.split(/\s+/).filter(Boolean)
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : source.slice(0, 2)
  return letters.toUpperCase()
}

function plural(n: number): string {
  return `${n} ${n === 1 ? 'person' : 'people'}`
}

interface GroupsState {
  groups: ContactGroup[]
  selectedId: string | null
  /** null = viewing; 'new' = creating; a group id = editing it. */
  editing: string | null
  load: () => Promise<void>
  select: (id: string) => void
  startNew: () => void
  startEdit: (id: string) => void
  done: (selectId?: string | null) => void
}

/** Shared between the group list (left column) and the detail pane (right). */
export const useGroups = create<GroupsState>((set) => ({
  groups: [],
  selectedId: null,
  editing: null,
  load: async () => {
    try {
      set({ groups: await window.clover.contacts.listGroups() })
    } catch (error) {
      toast(`Couldn't load groups: ${(error as Error).message}`, 'error')
    }
  },
  select: (id) => set({ selectedId: id, editing: null }),
  startNew: () => set({ selectedId: null, editing: 'new' }),
  startEdit: (id) => set({ selectedId: id, editing: id }),
  done: (selectId) =>
    set((s) => ({ editing: null, selectedId: selectId === undefined ? s.selectedId : selectId }))
}))

export function GroupList({ query }: { query: string }): ReactNode {
  const groups = useGroups((s) => s.groups)
  const selectedId = useGroups((s) => s.selectedId)
  const select = useGroups((s) => s.select)

  useEffect(() => {
    void useGroups.getState().load()
  }, [])

  const q = query.trim().toLowerCase()
  const shown = q
    ? groups.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.members.some((m) => m.email.includes(q) || (m.name ?? '').toLowerCase().includes(q))
      )
    : groups

  return (
    <div className="min-h-0 flex-1 overflow-y-auto py-1">
      {shown.length === 0 && (
        <p className="px-4 py-6 text-center text-[12.5px] leading-relaxed text-muted">
          {q
            ? 'No group matches that search.'
            : 'No groups yet. A group lets you email several people at once: type its name in To.'}
        </p>
      )}
      {shown.map((g) => (
        <button
          key={g.id}
          type="button"
          onClick={() => select(g.id)}
          className={
            'flex w-full items-center gap-2.5 px-3 py-2 text-left ' +
            (g.id === selectedId ? 'bg-accent/12' : 'hover:bg-black/5 dark:hover:bg-white/5')
          }
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/20 text-accent">
            <IconPeople className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-ink">{g.name}</span>
            <span className="block truncate text-[11.5px] text-muted">{plural(g.members.length)}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

export function GroupDetail(): ReactNode {
  const groups = useGroups((s) => s.groups)
  const selectedId = useGroups((s) => s.selectedId)
  const editing = useGroups((s) => s.editing)
  const group = groups.find((g) => g.id === selectedId) ?? null

  if (editing) return <GroupForm key={editing} group={editing === 'new' ? null : group} />
  if (!group) {
    return (
      <div className="grid h-full place-items-center p-8 text-center text-[13px] text-muted">
        Select a group, or create one to email several people at once.
      </div>
    )
  }

  async function remove(g: ContactGroup): Promise<void> {
    if (!window.confirm(`Delete the group ${g.name}? The contacts in it are kept.`)) return
    await window.clover.contacts.removeGroup(g.id)
    useGroups.getState().done(null)
    await useGroups.getState().load()
    toast(`Deleted ${g.name}`)
  }

  return (
    <div className="mx-auto max-w-lg px-8 py-8">
      <div className="flex items-center gap-4">
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-accent/60 text-accent-ink">
          <IconPeople className="h-7 w-7" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-[18px] font-semibold text-ink">{group.name}</h2>
          <p className="text-[13px] text-muted">{plural(group.members.length)}</p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={group.members.length === 0}
          onClick={() =>
            openCompose({ to: group.members.map((m) => formatAddress(m.name, m.email)).join(', ') })
          }
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-accent-ink disabled:opacity-50"
        >
          <IconMail className="h-4 w-4" /> Email group
        </button>
        <button
          type="button"
          onClick={() => useGroups.getState().startEdit(group.id)}
          className="rounded-lg border border-line px-3 py-1.5 text-[12.5px] text-muted hover:text-ink"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => void remove(group)}
          className="flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-[12.5px] text-muted hover:text-red-500"
        >
          <IconTrash className="h-3.5 w-3.5" /> Delete
        </button>
      </div>
      <ul className="mt-6 divide-y divide-line rounded-xl border border-line">
        {group.members.length === 0 && (
          <li className="px-3 py-3 text-[12.5px] text-muted">
            No one in this group yet. Use Edit to add people.
          </li>
        )}
        {group.members.map((m) => (
          <li key={m.id} className="flex items-center gap-2.5 px-3 py-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/20 text-[10.5px] font-semibold text-accent">
              {initials(m)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] text-ink">{m.name || m.email}</span>
              {m.name && <span className="block truncate text-[11.5px] text-muted">{m.email}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function GroupForm({ group }: { group: ContactGroup | null }): ReactNode {
  const [name, setName] = useState(group?.name ?? '')
  const [members, setMembers] = useState<Set<string>>(new Set(group?.members.map((m) => m.id) ?? []))
  const [people, setPeople] = useState<Contact[]>([])
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.clover.contacts
      .list('saved')
      .then(setPeople)
      .catch(() => undefined)
  }, [])

  const f = filter.trim().toLowerCase()
  const shown = f
    ? people.filter((p) => p.email.includes(f) || (p.name ?? '').toLowerCase().includes(f))
    : people

  function toggle(id: string): void {
    const next = new Set(members)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setMembers(next)
  }

  async function submit(): Promise<void> {
    setBusy(true)
    try {
      const saved = await window.clover.contacts.saveGroup(name, [...members], group?.id)
      await useGroups.getState().load()
      useGroups.getState().done(saved.id)
      toast(group ? 'Group saved' : 'Group created')
    } catch (error) {
      toast(
        (error as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''),
        'error'
      )
    } finally {
      setBusy(false)
    }
  }

  const input =
    'mt-1 w-full rounded-lg border border-line bg-canvas/60 px-3 py-2 text-[13px] text-ink outline-none focus:border-accent'

  return (
    <form
      className="mx-auto max-w-lg space-y-3 px-8 py-8"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <h2 className="pb-1 text-[16px] font-semibold text-ink">{group ? 'Edit group' : 'New group'}</h2>
      <label className="block">
        <span className="text-[12px] text-muted">Group name</span>
        <input value={name} autoFocus onChange={(e) => setName(e.target.value)} className={input} />
      </label>
      <div>
        <span className="text-[12px] text-muted">Members · {members.size} selected</span>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter contacts"
          className={input}
        />
        <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-line">
          {people.length === 0 && (
            <p className="px-3 py-3 text-[12.5px] text-muted">
              Save some contacts first: groups are made from your contacts.
            </p>
          )}
          {shown.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-black/5 dark:hover:bg-white/5"
            >
              <input
                type="checkbox"
                checked={members.has(p.id)}
                onChange={() => toggle(p.id)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-ink">{p.name || p.email}</span>
                {p.name && <span className="block truncate text-[11.5px] text-muted">{p.email}</span>}
              </span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => useGroups.getState().done()}
          className="rounded-lg border border-line px-4 py-2 text-[13px] text-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
