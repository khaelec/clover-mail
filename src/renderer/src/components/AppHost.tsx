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

    for (const app of apps) {
      if (nodes.has(app.id)) continue
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
    }
  }, [apps])

  useEffect(() => {
    for (const [id, node] of nodesRef.current) {
      const active = host?.appId === id
      node.style.visibility = active ? 'visible' : 'hidden'
      node.style.pointerEvents = active ? 'auto' : 'none'
    }
  }, [host, apps])

  const style = host
    ? { left: host.rect.left, top: host.rect.top, width: host.rect.width, height: host.rect.height }
    : { left: -20000, top: -20000, width: 1280, height: 800 }

  return (
    <div
      ref={hostRef}
      aria-hidden={!host}
      className="pointer-events-none fixed z-[5] overflow-hidden"
      style={style}
    />
  )
}
