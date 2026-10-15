import { Nodejs } from '@capawesome/capacitor-nodejs'
import { buildCloverApi, type CloverHost } from '@shared/cloverClient'

/**
 * Android client: builds `window.clover` against the on-device engine over the
 * nodejs-mobile message channel. Each call becomes `{ id, channel, args }` and
 * the reply arrives as `{ id, ok, result | error }`; engine events are pushed as
 * `{ channel, payload }`. No HTTP, no ports, no desktop.
 */
export async function installChannelClover(): Promise<void> {
  const w = window as unknown as { clover?: unknown }
  if (w.clover) return

  // Start the nodejs-mobile runtime (startMode is 'manual' in capacitor.config).
  try {
    const { ready } = await Nodejs.isReady()
    if (!ready) {
      console.log('CLOVER_UI_STARTING')
      await Nodejs.start()
      console.log('CLOVER_UI_STARTED')
    }
  } catch (error) {
    console.log(`CLOVER_UI_START_ERROR ${error instanceof Error ? error.message : String(error)}`)
  }

  const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  const listeners = new Map<string, Set<(payload: unknown) => void>>()
  let nextId = 0

  await Nodejs.addListener('message', (event) => {
    const arg = event.args[0] as Record<string, unknown>
    if (event.eventName === 'reply') {
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

  const invoke = (channel: string, ...args: unknown[]): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const id = String(++nextId)
      pending.set(id, { resolve, reject })
      // The args are JSON-serializable by construction (channel + CloverApi args).
      void Nodejs.send({ eventName: 'invoke', args: [{ id, channel, args }] as never })
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
}
