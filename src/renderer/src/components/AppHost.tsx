import { useEffect, useRef, type ReactNode } from 'react'
import { useApps } from '../state/apps'

/**
 * Single persistent host for every embedded app. One webview per app is created
 * once and kept alive (so logins stick and background apps can notify); switching
 * apps only toggles visibility instead of creating/destroying webviews, which
 * avoids the renderer crashes and re-logins that rapid switching used to cause.
 *
 * The visible app is positioned over a "slot" registered by whichever surface is
 * showing it (the Apps tab or the mail dock). With no slot, all apps stay loaded
 * offscreen so they keep receiving notifications.
 */
export function AppHost(): ReactNode {
  const apps = useApps((s) => s.apps)
  const load = useApps((s) => s.load)
  const host = useApps((s) => s.host)
  const hostRef = useRef<HTMLDivElement>(null)
  const nodesRef = useRef<Map<string, HTMLElement>>(new Map())

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const container = hostRef.current
    if (!container) return
    const nodes = nodesRef.current
    const wanted = new Set(apps.map((a) => a.id))

    for (const [id, node] of nodes) {
      if (!wanted.has(id)) {
        node.remove()
        nodes.delete(id)
      }
    }

    // Create an app's webview the first time it's shown, so it loads at its real
    // size (apps like Messenger compute their list from the initial viewport and
    // mis-render if they're loaded at some other size and then resized). Once
    // created it stays alive offscreen so background apps can still notify.
    const displayId = host?.appId ?? null
    if (displayId && wanted.has(displayId) && !nodes.has(displayId)) {
      const app = apps.find((a) => a.id === displayId)
      if (app) {
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
        container.appendChild(webview)
        nodes.set(app.id, webview)

        // Many web apps (Messenger, WhatsApp) prefix the document title with an
        // unread count, e.g. "(3) Messenger" — use it to drive the badge and the
        // in-app notification list.
        const webviewEl = webview as unknown as HTMLElement
        webviewEl.addEventListener('page-title-updated', (event) => {
          const title = String((event as { title?: string }).title ?? '')
          const match = title.match(/^\((\d+)\)/)
          useApps.getState().setAppUnread(app.id, app.name, match ? Number(match[1]) : 0)
        })
      }
    }

    for (const [id, node] of nodes) {
      const active = id === displayId
      node.style.visibility = active ? 'visible' : 'hidden'
      node.style.pointerEvents = active ? 'auto' : 'none'
    }
  }, [apps, host])

  const style = host
    ? { left: host.rect.left, top: host.rect.top, width: host.rect.width, height: host.rect.height }
    : { left: -20000, top: -20000, width: 1280, height: 800 }

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
