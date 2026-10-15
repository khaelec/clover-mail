import type { ReactNode } from 'react'
import { useSettings } from './context'
import { Card } from './ui'

export function PrivacyTab(): ReactNode {
  const { blockRemote, toggleBlockRemote } = useSettings()
  return (
    <Card title="Privacy">
      <button
        type="button"
        onClick={toggleBlockRemote}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <span>
          <span className="block text-[13px] text-ink">Block remote images</span>
          <span className="mt-0.5 block text-[12px] text-muted">
            Prevents senders from tracking when you open a message. Inline images still show.
          </span>
        </span>
        <span
          className={
            'relative h-6 w-11 shrink-0 rounded-full transition-colors ' +
            (blockRemote ? 'bg-accent' : 'bg-line')
          }
        >
          <span
            className={
              'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ' +
              (blockRemote ? 'left-[22px]' : 'left-0.5')
            }
          />
        </span>
      </button>
    </Card>
  )
}
