import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useApps } from '../state/apps'
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

  const ensureWebview = useCallback((app: CustomApp): void => {
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

    // Many web apps (Messenger, WhatsApp) prefix the document title with an
    // unread count, e.g. "(3) Messenger" — use it to drive the badge and the
    // in-app notification list.
    const webviewEl = webview as unknown as HTMLElement
    webviewEl.addEventListener('page-title-updated', (event) => {
      const title = String((event as { title?: string }).title ?? '')
      const match = title.match(/^\((\d+)\)/)
      useApps.getState().setAppUnread(app.id, app.name, match ? Number(match[1]) : 0)
    })
  }, [])

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
