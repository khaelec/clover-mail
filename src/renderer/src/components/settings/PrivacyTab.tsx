import { useEffect, useState, type ReactNode } from 'react'
import { useSettings } from './context'
import { Card } from './ui'
import { isNative } from '../../lib/mobile'
import { setStayConnected, stayConnectedEnabled } from '../../lib/background'

export function PrivacyTab(): ReactNode {
  const { blockRemote, toggleBlockRemote } = useSettings()
  const [stay, setStay] = useState(false)

  useEffect(() => {
    setStay(stayConnectedEnabled())
  }, [])

  function toggleStay(): void {
    const next = !stay
    setStay(next)
    void setStayConnected(next)
  }

  return (
    <>
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

      {isNative() && (
        <Card title="Background mail">
          <button
            type="button"
            onClick={toggleStay}
            className="flex w-full items-center justify-between gap-4 text-left"
          >
            <span>
              <span className="block text-[13px] text-ink">Stay connected</span>
              <span className="mt-0.5 block text-[12px] text-muted">
                Keep syncing new mail while the app is in the background. Android shows an ongoing
                notification for this, and it uses more battery.
              </span>
            </span>
            <span
              className={
                'relative h-6 w-11 shrink-0 rounded-full transition-colors ' +
                (stay ? 'bg-accent' : 'bg-line')
              }
            >
              <span
                className={
                  'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ' +
                  (stay ? 'left-[22px]' : 'left-0.5')
                }
              />
            </span>
          </button>
        </Card>
      )}
    </>
  )
}
