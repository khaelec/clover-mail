import { Nodejs } from '@capawesome/capacitor-nodejs'
import { buildCloverApi, type CloverHost } from '@shared/cloverClient'

/**
 * Android client: builds `window.clover` against the on-device engine over the
 * nodejs-mobile message channel. Each call becomes `{ id, channel, args }` and
 * the reply arrives as `{ id, ok, result | error }`; engine events are pushed as
 * `{ channel, payload }`. No HTTP, no ports, no desktop.
 *
 * The engine posts a `ready` message once its handlers are registered, so we
 * listen first and wait for that — the plugin's own readiness only means the
 * runtime started, which can be before the engine finished opening the DB.
 */
export async function installChannelClover(onStatus: (text: string) => void): Promise<void> {
  const w = window as unknown as { clover?: unknown }
  if (w.clover) return

  const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  const listeners = new Map<string, Set<(payload: unknown) => void>>()
  let nextId = 0
  let markReady: (() => void) | null = null
  const ready = new Promise<void>((resolve) => {
    markReady = resolve
  })

  await Nodejs.addListener('message', (event) => {
    const arg = event.args[0] as Record<string, unknown>
    if (event.eventName === 'ready') {
      markReady?.()
    } else if (event.eventName === 'reply') {
      const entry = pending.get(String(arg.id))
      if (!entry) return
      pending.delete(String(arg.id))
      if (arg.ok) entry.resolve(arg.result)
      else entry.reject(new Error(String(arg.error ?? 'Engine error')))
    } else if (event.eventName === 'event') {
      const set = listeners.get(String(arg.channel))
      if (set) for (const cb of set) cb(arg.payload)
    }
  })

  onStatus('waiting for the engine…')
  const ok = await Promise.race([
    ready.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 30000))
  ])
  if (!ok) throw new Error('the engine did not report ready')

  const invoke = (channel: string, ...args: unknown[]): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const id = String(++nextId)
      // JSON turns an `undefined` array element into `null`, which breaks the
      // engine's optional parameters (e.g. a null `limit` -> "datatype mismatch"
      // / LIMIT 0). Trim trailing undefineds so the defaults apply.
      const trimmed = [...args]
      while (trimmed.length > 0 && trimmed[trimmed.length - 1] === undefined) trimmed.pop()
      pending.set(id, { resolve, reject })
      void Nodejs.send({ eventName: 'invoke', args: [{ id, channel, args: trimmed }] as never })
    })

  const host: CloverHost = {
    invoke,
    send: (channel, ...args) => {
      void invoke(channel, ...args).catch(() => undefined)
    },
    on: (channel, cb) => {
      const set = listeners.get(channel) ?? new Set()
      set.add(cb)
      listeners.set(channel, set)
      return () => set.delete(cb)
    },
    getFilePath: () => ''
  }

  w.clover = buildCloverApi(host)
  onStatus('engine ready')
}
