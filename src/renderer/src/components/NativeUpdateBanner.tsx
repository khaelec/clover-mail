import { useEffect, useState, type ReactNode } from 'react'
import { isNative } from '../lib/mobile'
import { checkForUpdate, installUpdate, type UpdateInfo } from '../lib/nativeUpdate'

/**
 * Android update prompt: checks the published manifest on launch and offers a
 * one-tap update (download the APK, hand it to Android's installer).
 */
export function NativeUpdateBanner(): ReactNode {
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    if (!isNative()) return
    void checkForUpdate().then(setUpdate)
  }, [])

  if (!isNative() || !update) return null

  async function run(): Promise<void> {
    if (!update) return
    setBusy(true)
    setNote('Downloading…')
    try {
      await installUpdate(update.url)
      setNote('Opening the installer…')
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Update failed')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[80] flex items-center gap-3 border-t border-line bg-surface px-4 py-2.5 text-[12.5px] shadow-2xl">
      <span className="text-ink">
        Update available — <span className="font-medium">{update.version}</span>
        {note ? <span className="ml-2 text-muted">{note}</span> : null}
      </span>
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        className="ml-auto rounded-lg bg-accent px-3 py-1.5 font-medium text-accent-ink disabled:opacity-60"
      >
        {busy ? 'Updating…' : 'Update'}
      </button>
    </div>
  )
}
