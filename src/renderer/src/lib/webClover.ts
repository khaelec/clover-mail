/* eslint-disable @typescript-eslint/no-explicit-any */
import { buildCloverApi, type CloverHost } from '@shared/cloverClient'
import { getBase, getToken, setToken as saveToken } from './mobile'

/**
 * Browser client (the mobile app / a phone browser). When the renderer runs
 * outside Electron there's no preload, so this builds `window.clover` over the
 * transport server: POST /rpc for calls, an SSE stream for events. The token
 * comes from `?token=` (saved to storage) so the phone only needs a link; in the
 * native shell the desktop address comes from the connect screen instead.
 */
let reconnectStream: (() => void) | null = null

/** Re-open the event stream (e.g. after the phone app returns to the foreground). */
export function reconnectEvents(): void {
  reconnectStream?.()
}

export async function installWebClover(): Promise<void> {
  const w = window as unknown as { clover?: unknown }
  if (w.clover) return

  const params = new URLSearchParams(window.location.search)
  const incoming = params.get('token')
  if (incoming) await saveToken(incoming)
  const token = incoming ?? (await getToken())
  const base = getBase() || window.location.origin

  const listeners = new Map<string, Set<(...args: any[]) => void>>()
  const fire = (channel: string, payload: unknown): void => {
    const set = listeners.get(channel)
    if (set) for (const cb of set) cb(payload)
  }

  if (token) {
    let source: EventSource | null = null
    const connect = (): void => {
      source?.close()
      source = new EventSource(`${base}/events?token=${encodeURIComponent(token)}`)
      source.onmessage = (event) => {
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
      source.onerror = () => {
        source?.close()
        setTimeout(connect, 2000)
      }
    }
    reconnectStream = connect
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
