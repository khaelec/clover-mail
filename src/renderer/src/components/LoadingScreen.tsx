import type { ReactNode } from 'react'
import { CloverMark } from './icons'

/**
 * Shown while the app starts (mainly on Android, where the on-device engine
 * boots behind the WebView). Gives customers a logo + "starting" message instead
 * of a blank screen.
 */
export function LoadingScreen({ message = 'Starting…' }: { message?: string }): ReactNode {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-canvas text-ink">
      <CloverMark />
      <div className="text-[15px] font-semibold tracking-tight">Clover Mail</div>
      <div className="flex items-center gap-2 text-[12.5px] text-muted">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-accent" />
        {message}
      </div>
    </div>
  )
}
