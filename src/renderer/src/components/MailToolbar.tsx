import { useState, type RefObject, type ReactNode } from 'react'
import { useMail } from '../state/mail'
import { useLayout } from '../state/layout'
import { IconFilter, IconGrid, IconLayout, IconSearch, IconSliders, IconThreads, IconUnread } from './icons'
import { SearchFilters } from './SearchFilters'
import { SyncButton } from './MailList'

export function MailToolbar({
  query,
  setQuery,
  onShowRules,
  searchRef
}: {
  query: string
  setQuery: (q: string) => void
  onShowRules: () => void
  searchRef: RefObject<HTMLInputElement | null>
}): ReactNode {
  const threaded = useMail((s) => s.threaded)
  const setThreaded = useMail((s) => s.setThreaded)
  const unreadOnly = useMail((s) => s.unreadOnly)
  const setUnreadOnly = useMail((s) => s.setUnreadOnly)
  const sync = useMail((s) => s.sync)
  const layout = useLayout((s) => s.settings)
  const setLayout = useLayout((s) => s.set)
  const saveLayout = useLayout((s) => s.save)
  const [filtersOpen, setFiltersOpen] = useState(false)

  return (
    <div className="relative flex items-center gap-2 border-b border-line px-3 py-2.5">
      <IconSearch className="h-4 w-4 text-muted" />
      <input
        ref={searchRef}
        aria-label="Search mail"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search (try from:, is:unread, has:attachment)"
        className="w-full bg-transparent text-[13px] text-ink placeholder:text-muted focus:outline-none"
      />
      <button
        type="button"
        title="Search filters"
        aria-label="Search filters"
        aria-expanded={filtersOpen}
        onClick={() => setFiltersOpen((o) => !o)}
        className={
          'grid h-7 w-7 shrink-0 place-items-center rounded-md ' +
          (filtersOpen ? 'text-accent' : 'text-muted hover:text-accent')
        }
      >
        <IconSliders className="h-4 w-4" />
      </button>
      {filtersOpen && (
        <SearchFilters query={query} onSearch={setQuery} onClose={() => setFiltersOpen(false)} />
      )}
      <button
        type="button"
        title={threaded ? 'Group by conversation' : 'Show individual messages'}
        aria-label={threaded ? 'Group by conversation' : 'Show individual messages'}
        aria-pressed={threaded}
        onClick={() => void setThreaded(!threaded)}
        className={
          'grid h-7 w-7 place-items-center rounded-md ' +
          (threaded ? 'text-accent' : 'text-muted hover:text-accent')
        }
      >
        <IconThreads className="h-4 w-4" />
      </button>
      <button
        type="button"
        title="Unread only"
        aria-label="Unread only"
        aria-pressed={unreadOnly}
        onClick={() => setUnreadOnly(!unreadOnly)}
        className={
          'grid h-7 w-7 place-items-center rounded-md ' +
          (unreadOnly ? 'text-accent' : 'text-muted hover:text-accent')
        }
      >
        <IconUnread className="h-4 w-4" />
      </button>
      <button
        type="button"
        title="Toggle folder pane"
        aria-label="Toggle folder pane"
        aria-pressed={layout.showFolders}
        onClick={() => {
          setLayout({ showFolders: !layout.showFolders })
          void saveLayout()
        }}
        className={
          'grid h-7 w-7 place-items-center rounded-md ' +
          (layout.showFolders ? 'text-accent' : 'text-muted hover:text-accent')
        }
      >
        <IconLayout className="h-4 w-4" />
      </button>
      <button
        type="button"
        title="Open app beside the reader"
        aria-label="Open app beside the reader"
        aria-pressed={layout.dockOpen}
        onClick={() => {
          setLayout({ dockOpen: !layout.dockOpen })
          void saveLayout()
        }}
        className={
          'grid h-7 w-7 place-items-center rounded-md ' +
          (layout.dockOpen ? 'text-accent' : 'text-muted hover:text-accent')
        }
      >
        <IconGrid className="h-4 w-4" />
      </button>
      <button
        type="button"
        title="Rules & workflow"
        aria-label="Rules and workflow"
        onClick={onShowRules}
        className="grid h-7 w-7 place-items-center rounded-md text-muted hover:text-accent"
      >
        <IconFilter className="h-4 w-4" />
      </button>
      <SyncButton onSync={sync} />
    </div>
  )
}
