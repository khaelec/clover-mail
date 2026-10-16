import type { ReactNode } from 'react'
import {
  IconCalendar,
  IconGrid,
  IconMail,
  IconSettings,
  IconSparkles,
  IconWallpaper
} from './icons'

export type SectionId = 'mail' | 'calendar' | 'apps' | 'wallpaper' | 'copilot' | 'settings'

interface NavItem {
  id: SectionId
  label: string
  icon: (props: { className?: string }) => ReactNode
}

const PRIMARY: NavItem[] = [
  { id: 'mail', label: 'Mail', icon: IconMail },
  { id: 'calendar', label: 'Calendar', icon: IconCalendar },
  { id: 'apps', label: 'Apps', icon: IconGrid },
  { id: 'wallpaper', label: 'Wallpaper', icon: IconWallpaper },
  { id: 'copilot', label: 'Copilot', icon: IconSparkles }
]

function NavButton({
  item,
  active,
  onSelect
}: {
  item: NavItem
  active: boolean
  onSelect: (id: SectionId) => void
}): ReactNode {
  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      title={item.label}
      className={
        'group relative flex w-full flex-col items-center gap-1 rounded-xl py-2.5 text-[10px] font-medium transition-colors ' +
        (active ? 'text-accent' : 'text-muted hover:text-ink')
      }
    >
      <span
        className={
          'grid h-9 w-9 place-items-center rounded-xl transition-all ' +
          (active
            ? 'bg-accent/12 text-accent ring-1 ring-accent/30'
            : 'group-hover:bg-black/5 dark:group-hover:bg-white/10')
        }
      >
        <Icon />
      </span>
      <span className="leading-none">{item.label}</span>
    </button>
  )
}

export function Sidebar({
  active,
  onSelect,
  compact = false
}: {
  active: SectionId
  onSelect: (id: SectionId) => void
  compact?: boolean
}): ReactNode {
  // All sections are available on the phone; only individual features that
  // can't work there (e.g. the Wallpaper Engine provider) are gated.
  const items = PRIMARY
  void compact
  return (
    <nav className="flex w-[68px] shrink-0 flex-col items-center gap-1 border-r border-line bg-surface/60 py-3 backdrop-blur-xl">
      {items.map((item) => (
        <NavButton key={item.id} item={item} active={active === item.id} onSelect={onSelect} />
      ))}
      <div className="mt-auto flex flex-col items-center gap-2 pt-2">
        <NavButton
          item={{ id: 'settings', label: 'Settings', icon: IconSettings }}
          active={active === 'settings'}
          onSelect={onSelect}
        />
        <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-accent to-accent/60 text-[11px] font-semibold text-accent-ink ring-2 ring-surface">
          CM
        </div>
      </div>
    </nav>
  )
}
