import type { ReactNode } from 'react'

export function PlaceholderView({
  title,
  blurb,
  icon,
  upcoming
}: {
  title: string
  blurb: string
  icon: ReactNode
  upcoming: string[]
}): ReactNode {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="w-full max-w-lg animate-fade-in rounded-3xl border border-line bg-surface/70 p-8 text-center backdrop-blur-xl">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent/12 text-accent ring-1 ring-accent/25">
          {icon}
        </div>
        <h2 className="mt-4 text-lg font-semibold tracking-tight text-ink">{title}</h2>
        <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-muted">{blurb}</p>
        <div className="mt-5 rounded-2xl border border-line bg-canvas/40 p-4 text-left">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Planned</div>
          <ul className="space-y-1.5">
            {upcoming.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[13px] text-ink/90">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
