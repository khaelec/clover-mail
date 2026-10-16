import { registerPlugin } from '@capacitor/core'
import { isNative } from './mobile'

/**
 * "Stay connected": keeps the on-device engine running in the background (via a
 * foreground service) so Clover Mail keeps syncing and can notify about new
 * mail. Android requires an ongoing notification for this.
 */
interface CloverBackgroundPlugin {
  start(): Promise<void>
  stop(): Promise<void>
}

const plugin = registerPlugin<CloverBackgroundPlugin>('CloverBackground')
const KEY = 'clover.stayConnected'

export function stayConnectedEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export async function setStayConnected(on: boolean): Promise<void> {
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    // ignore
  }
  if (!isNative()) return
  try {
    await (on ? plugin.start() : plugin.stop())
  } catch {
    // plugin unavailable — nothing to do
  }
}

/** Re-apply the saved preference at startup. */
export async function initStayConnected(): Promise<void> {
  if (!isNative() || !stayConnectedEnabled()) return
  try {
    await plugin.start()
  } catch {
    // ignore
  }
}
