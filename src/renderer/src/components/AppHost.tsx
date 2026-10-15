import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useApps } from '../state/apps'
import { useNotifications } from '../state/notifications'
import { registerAppWebview, unregisterAppWebview } from '../lib/appWebviews'
import { acceptAppNotification, parseCapturedNotification } from '../lib/appNotifications'
import type { CustomApp } from '@shared/apps'

/**
 * Single persistent host for every embedded app. One webview per app is created
 * once and kept alive (so logins stick and background apps can notify); switching
 * apps only toggles visibility instead of creating/destroying webviews, which
 * avoids the renderer crashes and re-logins that rapid switching used to cause.
 *
 * Apps with "run in background" enabled are loaded at startup, staggered a few
 * seconds apart, so they can post notifications before you ever open them. They
 * load at the content-area size (offscreen, invisible, not clickable) rather than
 * a tiny size, because apps like Messenger mis-render if they load small and are
 * resized later.
 */
const BACKGROUND_START_MS = 3000
const BACKGROUND_STAGGER_MS = 4000

export function AppHost(): ReactNode {
  const apps = useApps((s) => s.apps)
  const load = useApps((s) => s.load)
  const host = useApps((s) => s.host)
  const hostRef = useRef<HTMLDivElement>(null)
  const nodesRef = useRef<Map<string, HTMLElement>>(new Map())
  const [hidden, setHidden] = useState({ width: 1280, height: 800 })

  useEffect(() => {
    void load()
  }, [load])

  // Size the offscreen host to the window's content area so background apps load
  // at a realistic size.
  useEffect(() => {
    const update = (): void =>
      setHidden({ width: window.innerWidth, height: Math.max(400, window.innerHeight - 44) })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // A notification captured from an app webview: validate, rate-limit, and add a
  // bell item (unless the app turned that off). Read the app fresh so a settings
  // change applies to webviews created earlier.
  const handleAppNotification = useCallback((appId: string, payload: unknown): void => {
    const app = useApps.getState().apps.find((a) => a.id === appId)
    if (!app) return
    const parsed = parseCapturedNotification(payload)
    if (!parsed) return
    if (!acceptAppNotification(appId)) return
    useApps.getState().markAppNotified(appId)
    if (!app.notifyInBell) return
    useNotifications.getState().add({
      kind: 'app',
      appId: app.id,
      appName: app.name,
      appNotifId: parsed.id,
      title: parsed.title || `New message in ${app.name}`,
      body: app.notifyHidePreview ? '' : parsed.body
    })
  }, [])

  const ensureWebview = useCallback(
    (app: CustomApp): void => {
      const container = hostRef.current
      if (!container) return
      const nodes = nodesRef.current
      if (nodes.has(app.id)) return

      const webview = document.createElement('webview')
      webview.setAttribute('partition', `persist:app-${app.id}`)
      webview.setAttribute('src', app.url)
      webview.setAttribute('allowpopups', 'true')
      webview.setAttribute('webpreferences', 'backgroundThrottling=false')
      webview.style.position = 'absolute'
      webview.style.inset = '0'
      webview.style.width = '100%'
      webview.style.height = '100%'
      webview.style.display = 'flex'
      webview.style.visibility = 'hidden'
      webview.style.pointerEvents = 'none'
      container.appendChild(webview)
      nodes.set(app.id, webview)
      registerAppWebview(app.id, webview as unknown as HTMLElement)

      const webviewEl = webview as unknown as HTMLElement
      // Many web apps (Messenger, WhatsApp) prefix the document title with an
      // unread count, e.g. "(3) Messenger" — use it to drive the badge.
      webviewEl.addEventListener('page-title-updated', (event) => {
        const title = String((event as { title?: string }).title ?? '')
        const match = title.match(/^\((\d+)\)/)
        useApps.getState().setAppUnread(app.id, app.name, match ? Number(match[1]) : 0)
      })
      // Captured notifications from our injected preload.
      webviewEl.addEventListener('ipc-message', (event) => {
        const msg = event as unknown as { channel: string; args: unknown[] }
        if (msg.channel === 'clover-app-notification') handleAppNotification(app.id, msg.args[0])
      })
      // Tell the page whether to suppress its own OS popup.
      webviewEl.addEventListener('dom-ready', () => {
        const current = useApps.getState().apps.find((a) => a.id === app.id)
        const send = (webview as unknown as { send?: (c: string, ...a: unknown[]) => void }).send
        try {
          send?.call(webview, 'clover-app-settings', { osPopup: current?.notifyOsPopup ?? true })
        } catch {
          // not ready
        }
      })
    },
    [handleAppNotification]
  )

  // Load background apps at startup, staggered so launch doesn't stall.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    apps
      .filter((app) => app.runInBackground)
      .forEach((app, index) => {
        timers.push(
          setTimeout(() => ensureWebview(app), BACKGROUND_START_MS + index * BACKGROUND_STAGGER_MS)
        )
      })
    return () => {
      for (const timer of timers) clearTimeout(timer)
    }
  }, [apps, ensureWebview])

  // Push current per-app notification settings to live webviews (e.g. after a
  // toggle).
  useEffect(() => {
    for (const app of apps) {
      const el = nodesRef.current.get(app.id) as unknown as
        | { send?: (c: string, ...a: unknown[]) => void }
        | undefined
      try {
        el?.send?.call(el, 'clover-app-settings', { osPopup: app.notifyOsPopup })
      } catch {
        // not ready
      }
    }
  }, [apps])

  // Ensure the active app's webview exists and show only it.
  useEffect(() => {
    const container = hostRef.current
    if (!container) return
    const nodes = nodesRef.current
    const wanted = new Set(apps.map((a) => a.id))
    for (const [id, node] of nodes) {
      if (!wanted.has(id)) {
        node.remove()
        nodes.delete(id)
        unregisterAppWebview(id)
      }
    }

    const displayId = host?.appId ?? null
    if (displayId) {
      const app = apps.find((a) => a.id === displayId)
      if (app) ensureWebview(app)
    }

    for (const [id, node] of nodes) {
      const active = id === displayId
      node.style.visibility = active ? 'visible' : 'hidden'
      node.style.pointerEvents = active ? 'auto' : 'none'
    }
  }, [apps, host, ensureWebview])

  const style = host
    ? { left: host.rect.left, top: host.rect.top, width: host.rect.width, height: host.rect.height }
    : { left: -20000, top: -20000, width: hidden.width, height: hidden.height }

  return (
    <div
      ref={hostRef}
      aria-hidden={!host}
      data-clover-apphost={host ? 'active' : 'idle'}
      className="pointer-events-none fixed z-[5] overflow-hidden"
      style={style}
    />
  )
}
