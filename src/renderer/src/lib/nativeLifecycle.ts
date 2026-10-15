import { isNative } from './mobile'
import { reconnectEvents } from './webClover'

/**
 * When the phone app comes back to the foreground, re-open the event stream
 * (Android suspends it while backgrounded) and tell the app to catch up. The
 * mail store listens for `clover:resume` to re-sync and refresh.
 */
export async function initNativeLifecycle(): Promise<void> {
  if (!isNative()) return
  try {
    const { App } = await import('@capacitor/app')
    await App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return
      reconnectEvents()
      window.dispatchEvent(new Event('clover:resume'))
    })
  } catch {
    // ignore
  }
}
