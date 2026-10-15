import { useEffect, useState, type ReactNode } from 'react'
import { useSettings } from './context'
import { Card } from './ui'

export function PrivacyTab(): ReactNode {
  const { blockRemote, toggleBlockRemote } = useSettings()
  const [mobileEnabled, setMobileEnabled] = useState(false)
  const [mobileUrl, setMobileUrl] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    void window.clover.mobileInfo().then((info) => {
      setMobileEnabled(info.enabled)
      setMobileUrl(info.url)
    })
  }, [])

  async function toggleMobile(): Promise<void> {
    const next = !mobileEnabled
    setMobileEnabled(next)
    await window.clover.settings.set('mobile.enabled', next)
    const info = await window.clover.mobileInfo()
    setMobileUrl(info.url)
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

      <Card title="Mobile access">
        <button
          type="button"
          onClick={() => void toggleMobile()}
          className="flex w-full items-center justify-between gap-4 text-left"
        >
          <span>
            <span className="block text-[13px] text-ink">Serve to mobile / LAN</span>
            <span className="mt-0.5 block text-[12px] text-muted">
              Lets a phone on your network open Clover Mail in a browser — or the Android app —
              by talking to this computer. Restart Clover Mail to apply. Leave it off on untrusted
              networks; anyone with the link can read your mail.
            </span>
          </span>
          <span
            className={
              'relative h-6 w-11 shrink-0 rounded-full transition-colors ' +
              (mobileEnabled ? 'bg-accent' : 'bg-line')
            }
          >
            <span
              className={
                'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ' +
                (mobileEnabled ? 'left-[22px]' : 'left-0.5')
              }
            />
          </span>
        </button>
        {mobileEnabled && mobileUrl && (
          <div className="mt-3 flex items-center gap-2">
            <input
              readOnly
              value={mobileUrl}
              onFocus={(e) => e.target.select()}
              className="min-w-0 flex-1 rounded-lg border border-line bg-canvas/60 px-2.5 py-1.5 text-[12px] text-ink outline-none"
            />
            <button
              type="button"
              onClick={() => {
                void window.navigator.clipboard.writeText(mobileUrl).then(() => {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                })
              }}
              className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-[12px] text-muted hover:text-ink"
            >
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
        )}
      </Card>
    </>
  )
}
