import { useEffect, useState, type ReactNode } from 'react'
import {
  CloverMark,
  IconClose,
  IconMaximize,
  IconMinimize,
  IconRestore
} from './icons'

function WindowButton({
  onClick,
  danger,
  label,
  children
}: {
  onClick: () => void
  danger?: boolean
  label: string
  children: ReactNode
}): ReactNode {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={
        'app-no-drag grid h-8 w-10 place-items-center rounded-md text-muted transition-colors ' +
        (danger
          ? 'hover:bg-rose-500 hover:text-white'
          : 'hover:bg-black/5 hover:text-ink dark:hover:bg-white/10')
      }
    >
      {children}
    </button>
  )
}

export function TitleBar(): ReactNode {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    void window.clover.window.isMaximized().then(setMaximized)
    return window.clover.window.onMaximizedChanged(setMaximized)
  }, [])

  return (
    <header className="app-drag flex h-11 shrink-0 items-center gap-2 border-b border-line bg-surface/70 pl-3 pr-2 backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <CloverMark />
        <span className="text-[13px] font-semibold tracking-tight text-ink">Clover Mail</span>
      </div>

      <div className="ml-auto flex items-center gap-0.5">
        <WindowButton label="Minimize" onClick={() => window.clover.window.minimize()}>
          <IconMinimize />
        </WindowButton>
        <WindowButton
          label={maximized ? 'Restore' : 'Maximize'}
          onClick={() => window.clover.window.toggleMaximize()}
        >
          {maximized ? <IconRestore /> : <IconMaximize />}
        </WindowButton>
        <WindowButton label="Close" danger onClick={() => window.clover.window.close()}>
          <IconClose />
        </WindowButton>
      </div>
    </header>
  )
}
