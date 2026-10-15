import { isNative } from './mobile'

/**
 * System notifications on the phone. The plugin is imported lazily so the web
 * build (and the desktop renderer) never pull in the native code. Only works
 * while the app is running — there is no push service yet (see PLAN-mobile
 * Phase 4).
 */
export interface NativeNotifyPayload {
  title: string
  body?: string
  nav?: string
  accountId?: string
  messageId?: string
}

type Permission = 'unknown' | 'granted' | 'denied'
let permission: Permission = 'unknown'
let nextId = 1

async function granted(): Promise<boolean> {
  if (permission === 'granted') return true
  if (permission === 'denied') return false
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    let state = (await LocalNotifications.checkPermissions()).display
    if (state !== 'granted') state = (await LocalNotifications.requestPermissions()).display
    permission = state === 'granted' ? 'granted' : 'denied'
  } catch {
    permission = 'denied'
  }
  return permission === 'granted'
}

/** Show a system notification (no-op outside the native shell). */
export async function nativeNotify(payload: NativeNotifyPayload): Promise<void> {
  if (!isNative()) return
  if (!(await granted())) return
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    await LocalNotifications.schedule({
      notifications: [
        {
          id: nextId++,
          title: payload.title,
          body: payload.body ?? '',
          extra: {
            nav: payload.nav,
            accountId: payload.accountId,
            messageId: payload.messageId
          }
        }
      ]
    })
  } catch {
    // notifications are best-effort
  }
}

/** Route a tap on a system notification back into the app. */
export async function initNativeNotifications(
  onOpen: (extra: { nav?: string; accountId?: string; messageId?: string }) => void
): Promise<void> {
  if (!isNative()) return
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    await LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
      const extra = (event.notification.extra ?? {}) as {
        nav?: string
        accountId?: string
        messageId?: string
      }
      onOpen(extra)
    })
    void granted()
  } catch {
    // ignore
  }
}
