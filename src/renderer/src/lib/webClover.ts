/* eslint-disable @typescript-eslint/no-explicit-any */
import { buildCloverApi, type CloverHost } from '@shared/cloverClient'

/**
 * Browser client (the mobile app / a phone browser). When the renderer runs
 * outside Electron there's no preload, so this builds `window.clover` over the
 * transport server: POST /rpc for calls, an SSE stream for events. The token
 * comes from `?token=` (saved to localStorage) so the phone only needs a link.
 */
export function installWebClover(): void {
  const w = window as unknown as { clover?: unknown }
  if (w.clover) return

  const params = new URLSearchParams(window.location.search)
  const token = params.get('token') ?? localStorage.getItem('clover.token') ?? ''
  if (token) localStorage.setItem('clover.token', token)
  const base = window.location.origin

  const listeners = new Map<string, Set<(...args: any[]) => void>>()
  const fire = (channel: string, payload: unknown): void => {
    const set = listeners.get(channel)
    if (set) for (const cb of set) cb(payload)
  }

  if (token) {
    const connect = (): void => {
      const es = new EventSource(`${base}/events?token=${encodeURIComponent(token)}`)
      es.onmessage = (event) => {
        try {
          const { channel, payload } = JSON.parse(event.data) as {
            channel: string
            payload: unknown
          }
          fire(channel, payload)
        } catch {
          // ignore malformed frames
        }
      }
      es.onerror = () => {
        es.close()
        setTimeout(connect, 2000)
      }
    }
    connect()
  }

  const invoke = async (channel: string, ...args: any[]): Promise<any> => {
    const res = await fetch(`${base}/rpc`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-clover-token': token },
      body: JSON.stringify({ channel, args })
    })
    const json = (await res.json()) as { result?: unknown; error?: string }
    if (json.error) throw new Error(json.error)
    return json.result
  }

  const host: CloverHost = {
    invoke,
    send: (channel, ...args) => {
      void invoke(channel, ...args).catch(() => undefined)
    },
    on: (channel, cb) => {
      const set = listeners.get(channel) ?? new Set<(...a: any[]) => void>()
      set.add(cb)
      listeners.set(channel, set)
      return () => set.delete(cb)
    },
    getFilePath: () => ''
  }

  w.clover = buildCloverApi(host)
}
