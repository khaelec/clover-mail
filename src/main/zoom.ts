import type { BrowserWindow } from 'electron'
import { getSetting, setSetting } from '@core/settings'
import { SETTINGS_KEYS, ZOOM_LEVELS, clampZoom } from '@shared/theme'

const appWindows = new Set<BrowserWindow>()

function savedZoom(): number {
  return clampZoom(Number(getSetting(SETTINGS_KEYS.uiZoom) ?? 1))
}

/** Apply the saved zoom to every open app window (main + pop-outs). */
export function applyZoomToAll(): void {
  const factor = savedZoom()
  for (const win of appWindows) {
    if (!win.isDestroyed()) win.webContents.setZoomFactor(factor)
  }
}

/** Step to the next/previous preset, or back to 100%, and save it. */
function stepZoom(direction: 1 | -1 | 0): void {
  const current = savedZoom()
  let next = 1
  if (direction !== 0) {
    const levels = direction > 0 ? ZOOM_LEVELS : [...ZOOM_LEVELS].reverse()
    next = levels.find((l) => (direction > 0 ? l > current + 0.001 : l < current - 0.001)) ?? current
  }
  setSetting(SETTINGS_KEYS.uiZoom, next)
  applyZoomToAll()
}

/**
 * Keep an app window at the saved zoom, and give it Ctrl+= / Ctrl+- / Ctrl+0
 * and Ctrl+scroll. Zoom is one app-wide setting, so every window follows.
 */
export function attachZoom(win: BrowserWindow): void {
  appWindows.add(win)
  win.on('closed', () => appWindows.delete(win))
  const contents = win.webContents
  contents.on('did-finish-load', () => contents.setZoomFactor(savedZoom()))
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !(input.control || input.meta) || input.alt) return
    if (input.code === 'Equal' || input.code === 'NumpadAdd') stepZoom(1)
    else if (input.code === 'Minus' || input.code === 'NumpadSubtract') stepZoom(-1)
    else if (input.code === 'Digit0' || input.code === 'Numpad0') stepZoom(0)
    else return
    event.preventDefault()
  })
  contents.on('zoom-changed', (_event, direction) => stepZoom(direction === 'in' ? 1 : -1))
}
