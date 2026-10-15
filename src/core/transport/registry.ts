/**
 * Channel registry. Every IPC handler is registered here (via the `ipcHost`
 * wrapper in main) so the same handlers can be served over more than one
 * transport: Electron IPC for the desktop renderer, and the HTTP/WS transport for
 * the mobile client. Electron-free, so it lives in the core.
 */
export type ChannelHandler = (...args: unknown[]) => unknown

const handlers = new Map<string, ChannelHandler>()

export function registerChannel(channel: string, handler: ChannelHandler): void {
  handlers.set(channel, handler)
}

export function hasChannel(channel: string): boolean {
  return handlers.has(channel)
}

export function channelNames(): string[] {
  return [...handlers.keys()]
}

export async function dispatch(channel: string, args: unknown[]): Promise<unknown> {
  const handler = handlers.get(channel)
  if (!handler) throw new Error(`Unknown channel: ${channel}`)
  return await handler(...args)
}
