import type { ReactNode, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function Base({ children, ...props }: IconProps & { children: ReactNode }): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export const IconMail = (p: IconProps): ReactNode => (
  <Base {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="m4 7 8 6 8-6" />
  </Base>
)

export const IconCalendar = (p: IconProps): ReactNode => (
  <Base {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2.5" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Base>
)

export const IconGrid = (p: IconProps): ReactNode => (
  <Base {...p}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
  </Base>
)

export const IconWallpaper = (p: IconProps): ReactNode => (
  <Base {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <circle cx="8.5" cy="9.5" r="1.6" />
    <path d="m4 18 5-5 4 4 3-3 4 4" />
  </Base>
)

export const IconSparkles = (p: IconProps): ReactNode => (
  <Base {...p}>
    <path d="M12 3l1.8 4.9L18.7 9.7l-4.9 1.8L12 16.4l-1.8-4.9L5.3 9.7l4.9-1.8z" />
    <path d="M18.5 4.5 19 6l1.5.5L19 7l-.5 1.5L18 7l-1.5-.5L18 6z" />
  </Base>
)

export const IconSettings = (p: IconProps): ReactNode => (
  <Base {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 13.5a7.9 7.9 0 0 0 0-3l1.7-1.3-1.9-3.3-2 .8a7.7 7.7 0 0 0-2.6-1.5L14 3h-4l-.6 2.2A7.7 7.7 0 0 0 6.8 6.7l-2-.8L2.9 9.2l1.7 1.3a7.9 7.9 0 0 0 0 3l-1.7 1.3 1.9 3.3 2-.8a7.7 7.7 0 0 0 2.6 1.5L10 21h4l.6-2.2a7.7 7.7 0 0 0 2.6-1.5l2 .8 1.9-3.3z" />
  </Base>
)

export const IconSearch = (p: IconProps): ReactNode => (
  <Base {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
  </Base>
)

export const IconCompose = (p: IconProps): ReactNode => (
  <Base {...p}>
    <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" />
    <path d="M14.5 6.5 17.5 9.5" />
  </Base>
)

export const IconInbox = (p: IconProps): ReactNode => (
  <Base {...p}>
    <path d="M4 13h4l1.5 2.5h5L16 13h4" />
    <path d="M5 5h14l1 8v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4z" />
  </Base>
)

export const IconStar = (p: IconProps): ReactNode => (
  <Base {...p}>
    <path d="m12 4 2.3 4.9 5.2.6-3.9 3.6 1 5.3L12 16.8 7.4 18.4l1-5.3L4.5 9.5l5.2-.6z" />
  </Base>
)

export const IconSend = (p: IconProps): ReactNode => (
  <Base {...p}>
    <path d="M20 4 3 11l7 2 2 7z" />
    <path d="M20 4 10 13" />
  </Base>
)

export const IconMinimize = (p: IconProps): ReactNode => (
  <Base strokeWidth={1.6} {...p}>
    <path d="M5 12h14" />
  </Base>
)

export const IconMaximize = (p: IconProps): ReactNode => (
  <Base strokeWidth={1.6} {...p}>
    <rect x="5" y="5" width="14" height="14" rx="2" />
  </Base>
)

export const IconRestore = (p: IconProps): ReactNode => (
  <Base strokeWidth={1.6} {...p}>
    <rect x="7" y="7" width="12" height="12" rx="2" />
    <path d="M5 15V6a2 2 0 0 1 2-2h9" />
  </Base>
)

export const IconClose = (p: IconProps): ReactNode => (
  <Base strokeWidth={1.6} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Base>
)

export const IconSun = (p: IconProps): ReactNode => (
  <Base {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Base>
)

export const IconMoon = (p: IconProps): ReactNode => (
  <Base {...p}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4 8.2 8.2 0 1 0 20 14.5z" />
  </Base>
)

export const IconMonitor = (p: IconProps): ReactNode => (
  <Base {...p}>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </Base>
)

export const IconCheck = (p: IconProps): ReactNode => (
  <Base strokeWidth={2.2} {...p}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Base>
)

export const IconPlus = (p: IconProps): ReactNode => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
)

export const IconRefresh = (p: IconProps): ReactNode => (
  <Base {...p}>
    <path d="M20 11a8 8 0 0 0-13.7-5.3L4 8" />
    <path d="M4 4v4h4" />
    <path d="M4 13a8 8 0 0 0 13.7 5.3L20 16" />
    <path d="M20 20v-4h-4" />
  </Base>
)

export const IconTrash = (p: IconProps): ReactNode => (
  <Base {...p}>
    <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
  </Base>
)

export const IconPaperclip = (p: IconProps): ReactNode => (
  <Base {...p}>
    <path d="M21 11.5 12.5 20a4.6 4.6 0 0 1-6.5-6.5l8-8a3 3 0 0 1 4.3 4.3l-8 8a1.4 1.4 0 0 1-2-2l7-7" />
  </Base>
)

export const IconArrowLeft = (p: IconProps): ReactNode => (
  <Base {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Base>
)

export const IconReply = (p: IconProps): ReactNode => (
  <Base {...p}>
    <path d="M9 7 4 12l5 5" />
    <path d="M4 12h11a5 5 0 0 1 5 5v1" />
  </Base>
)

export const IconFlag = (p: IconProps): ReactNode => (
  <Base {...p}>
    <path d="M5 21V4" />
    <path d="M5 5h12l-2 3 2 3H5" />
  </Base>
)

export function CloverMark({ className }: { className?: string }): ReactNode {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" className={className} aria-hidden="true">
      <path
        fill="var(--accent)"
        d="M12 11.2C11 8.6 9.9 6 8.4 4.7 6.9 3.4 4.4 4.1 4 6.1c-.4 2.1 1.3 3.6 3.7 4.1-2.1.9-3.9 2.1-3.8 4.1.1 2 2.4 3 4.1 1.9 1.5-1 2.9-3.3 4-5z"
      />
      <path
        fill="var(--accent)"
        d="M12 11.2c1-2.6 2.1-5.2 3.6-6.5 1.5-1.3 4-.6 4.4 1.4.4 2.1-1.3 3.6-3.7 4.1 2.1.9 3.9 2.1 3.8 4.1-.1 2-2.4 3-4.1 1.9-1.5-1-2.9-3.3-4-5z"
        opacity="0.75"
      />
      <path stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" d="M12 11.5 12 20" />
    </svg>
  )
}
