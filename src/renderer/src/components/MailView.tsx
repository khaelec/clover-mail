import { useState, type ReactNode } from 'react'
import { IconCompose, IconInbox, IconSearch, IconSend, IconStar } from './icons'

interface SampleMessage {
  id: number
  from: string
  subject: string
  preview: string
  time: string
  unread?: boolean
  starred?: boolean
}

const SAMPLE: SampleMessage[] = [
  {
    id: 1,
    from: 'Ava Thompson',
    subject: 'Q3 rollout timeline — your sign-off',
    preview: 'Thanks for pulling the numbers together. I tightened the timeline to four weeks and flagged the two dependencies we discussed…',
    time: '9:41 AM',
    unread: true,
    starred: true
  },
  {
    id: 2,
    from: 'Cloverfield IT',
    subject: 'Re: VPN certificate renewal',
    preview: 'The new profile is live. Please import it before Friday — the old cert expires at midnight…',
    time: '8:12 AM',
    unread: true
  },
  {
    id: 3,
    from: 'Marek Nowak',
    subject: 'Invoice #4821 — paid ✓',
    preview: 'Just a heads-up that finance cleared it this morning, so no action needed on your end.',
    time: 'Yesterday'
  },
  {
    id: 4,
    from: 'Design weekly',
    subject: 'Agenda + Figma links for Thursday',
    preview: 'Draft agenda below. I added a slot for the wallpaper theming review you asked about…',
    time: 'Yesterday'
  },
  {
    id: 5,
    from: 'Delta Airlines',
    subject: 'Your itinerary is confirmed',
    preview: 'Confirmation code 7QX2PL. Check-in opens 24 hours before departure.',
    time: 'Mon'
  },
  {
    id: 6,
    from: 'Calendar',
    subject: 'Invitation: Roadmap sync (.ics attached)',
    preview: 'You have been invited to Roadmap sync on Friday at 10:00. Accept or decline below.',
    time: 'Mon',
    starred: true
  }
]

function FolderRow({ label, count, active }: { label: string; count?: number; active?: boolean }): ReactNode {
  return (
    <button
      type="button"
      className={
        'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ' +
        (active ? 'bg-accent/12 font-medium text-accent' : 'text-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/10')
      }
    >
      <span className="flex items-center gap-2">
        <IconInbox className="h-4 w-4" />
        {label}
      </span>
      {count !== undefined && (
        <span className={'text-[11px] ' + (active ? 'text-accent' : 'text-muted')}>{count}</span>
      )}
    </button>
  )
}

export function MailView(): ReactNode {
  const [selectedId, setSelectedId] = useState(1)
  const selected = SAMPLE.find((m) => m.id === selectedId) ?? SAMPLE[0]

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-52 shrink-0 flex-col gap-1 border-r border-line p-2.5">
        <button
          type="button"
          className="mb-2 flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-accent-ink shadow-sm transition-transform hover:scale-[1.01] active:scale-[0.99]"
        >
          <IconCompose className="h-4 w-4" />
          Compose
        </button>
        <FolderRow label="Inbox" count={12} active />
        <FolderRow label="Starred" count={3} />
        <FolderRow label="Sent" />
        <FolderRow label="Drafts" count={1} />
        <FolderRow label="Archive" />
        <FolderRow label="Trash" />
      </aside>

      <section className="flex w-[360px] shrink-0 flex-col border-r border-line">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <IconSearch className="h-4 w-4 text-muted" />
          <input
            placeholder="Search mail"
            className="w-full bg-transparent text-[13px] text-ink placeholder:text-muted focus:outline-none"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {SAMPLE.map((m) => {
            const active = m.id === selectedId
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedId(m.id)}
                className={
                  'block w-full border-b border-line/70 px-3.5 py-3 text-left transition-colors ' +
                  (active ? 'bg-accent/8' : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]')
                }
              >
                <div className="flex items-center gap-2">
                  <span className={'truncate text-[13px] ' + (m.unread ? 'font-semibold text-ink' : 'text-ink/90')}>
                    {m.from}
                  </span>
                  {m.starred && <IconStar className="h-3.5 w-3.5 shrink-0 text-amber-400" />}
                  <span className="ml-auto shrink-0 text-[11px] text-muted">{m.time}</span>
                </div>
                <div className={'mt-0.5 truncate text-[13px] ' + (m.unread ? 'font-medium text-ink' : 'text-muted')}>
                  {m.subject}
                </div>
                <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted">{m.preview}</div>
              </button>
            )
          })}
        </div>
      </section>

      <article className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-start gap-3 border-b border-line px-6 py-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-accent/60 text-[13px] font-semibold text-accent-ink">
            {selected.from.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-ink">{selected.subject}</h2>
            <p className="mt-0.5 text-[12px] text-muted">
              <span className="text-ink/80">{selected.from}</span> · to me · {selected.time}
            </p>
          </div>
          <div className="ml-auto flex gap-1.5">
            <button className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-ink">
              Reply
            </button>
            <button className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-accent-ink">
              <IconSend className="h-3.5 w-3.5" />
              Send
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 text-[13.5px] leading-relaxed text-ink/90">
          <p>Hi,</p>
          <p className="mt-3">
            {selected.preview} I copied the key dates below so we have a single source of truth
            while the plans settle.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            <li>Kickoff and environment prep — week 1</li>
            <li>Integration build and review — weeks 2–3</li>
            <li>Hardening, docs, and handoff — week 4</li>
          </ul>
          <p className="mt-3">
            Happy to walk through any of this live — just grab a slot on my calendar. I've also
            attached the updated plan and an <span className="text-accent">.ics</span> invite for
            the kickoff.
          </p>
          <p className="mt-3 text-muted">— Sent from Clover Mail</p>
        </div>
      </article>
    </div>
  )
}
