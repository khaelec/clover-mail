import { useState, type ReactNode } from 'react'
import { CloverMark } from './icons'
import { normalizeBase, setBase, setToken } from '../lib/mobile'

/**
 * First-run screen in the mobile app: point it at the desktop's transport server.
 * The desktop shows the address and token under Settings → Privacy → Mobile
 * access; entering them here (once) connects the phone.
 */
export function ConnectScreen(): ReactNode {
  const [url, setUrl] = useState('')
  const [token, setTokenValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function connect(): Promise<void> {
    const base = normalizeBase(url)
    if (!base) {
      setError('Enter the address shown on your desktop.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`${base}/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-clover-token': token.trim() },
        body: JSON.stringify({ channel: 'app:info', args: [] })
      })
      if (!res.ok) throw new Error(`The desktop replied ${res.status}.`)
      setBase(base)
      setToken(token)
      window.location.reload()
    } catch {
      setError('Could not reach the desktop. Check the address, token and that both devices are on the same network.')
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-canvas p-6 text-ink">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-xl">
        <div className="flex items-center gap-2">
          <CloverMark />
          <span className="text-[15px] font-semibold tracking-tight">Clover Mail</span>
        </div>
        <p className="mt-3 text-[12.5px] text-muted">
          Connect to the Clover Mail running on your computer. On the desktop open
          <span className="text-ink"> Settings → Privacy → Mobile access</span> and enter the
          address and token shown there.
        </p>

        <label className="mt-5 block text-[11px] font-medium text-muted">
          Desktop address
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="192.168.1.5:8787"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-[13px] text-ink outline-none focus:border-accent"
          />
        </label>

        <label className="mt-3 block text-[11px] font-medium text-muted">
          Access token
          <input
            value={token}
            onChange={(e) => setTokenValue(e.target.value)}
            placeholder="token"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-[13px] text-ink outline-none focus:border-accent"
          />
        </label>

        {error && <p className="mt-3 text-[12px] text-rose-500">{error}</p>}

        <button
          type="button"
          onClick={() => void connect()}
          disabled={busy}
          className="mt-5 w-full rounded-lg bg-accent px-4 py-2.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy ? 'Connecting…' : 'Connect'}
        </button>
      </div>
    </div>
  )
}
