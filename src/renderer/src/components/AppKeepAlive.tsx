import { useEffect, useRef, type ReactNode } from 'react'
import { useApps } from '../state/apps'

/**
 * Keeps every added app loaded in a hidden, unthrottled webview so logged-in apps
 * (Messenger, WhatsApp, …) still keep their connection and raise notifications when
 * they aren't the app currently on screen. The app that is on screen is skipped to
 * avoid running it twice.
 */
export function AppKeepAlive(): ReactNode {
  const apps = useApps((s) => s.apps)
  const load = useApps((s) => s.load)
  const displayedAppId = useApps((s) => s.displayedAppId)
  const hostRef = useRef<HTMLDivElement>(null)
  const nodesRef = useRef<Map<string, HTMLElement>>(new Map())

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const nodes = nodesRef.current
    const wanted = new Set(apps.filter((a) => a.id !== displayedAppId).map((a) => a.id))

    for (const [id, node] of nodes) {
      if (!wanted.has(id)) {
        node.remove()
        nodes.delete(id)
      }
    }

    for (const app of apps) {
      if (app.id === displayedAppId || nodes.has(app.id)) continue
      const webview = document.createElement('webview')
      webview.setAttribute('partition', `persist:app-${app.id}`)
      webview.setAttribute('src', app.url)
      webview.setAttribute('webpreferences', 'backgroundThrottling=false')
      webview.style.width = '1280px'
      webview.style.height = '800px'
      host.appendChild(webview)
      nodes.set(app.id, webview)
    }
  }, [apps, displayedAppId])

  return (
    <div
      ref={hostRef}
      aria-hidden
      className="pointer-events-none fixed -z-10 h-[800px] w-[1280px] overflow-hidden opacity-0"
      style={{ left: 0, top: 0 }}
    />
  )
}
