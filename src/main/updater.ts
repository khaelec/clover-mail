import { app, type BrowserWindow } from 'electron'
import { existsSync } from 'node:fs'
import { join, normalize, sep } from 'node:path'
import type { AppUpdater } from 'electron-updater'
import type { UpdateEvent } from '@shared/ipc'
import { cleanupUpdateDir } from './updateCleanup'

let updater: AppUpdater | null = null
let getWindow: () => BrowserWindow | null = () => null
let initialized = false
let forceQuit: () => void = () => undefined
let managedRuntime = false

/** Registered by the main process so quitForUpdate can bypass close-to-tray. */
export function setForceQuit(fn: () => void): void {
  forceQuit = fn
}

export function setUpdateWindow(fn: () => BrowserWindow | null): void {
  getWindow = fn
}

function emit(event: UpdateEvent): void {
  getWindow()?.webContents.send('update:event', event)
}

/**
 * Directory where electron-updater keeps downloaded installers. HARD RULE: this
 * must never be, contain, or sit inside the user's data directory — an update
 * may replace program files but must never delete accounts, mail or attachments.
 */
function updaterCacheDir(): string | null {
  const local = process.env.LOCALAPPDATA
  if (!local) return null
  const dir = normalize(join(local, `${app.getName()}-updater`))
  const userData = normalize(app.getPath('userData'))
  const overlaps =
    dir === userData ||
    dir.startsWith(userData + sep) ||
    userData.startsWith(dir + sep)
  return overlaps ? null : dir
}

export async function initUpdater(): Promise<void> {
  if (initialized) return
  initialized = true
  if (!app.isPackaged) {
    emit({ type: 'unavailable-dev' })
    return
  }

  // Flatpak/Snap installs are updated by the platform, not by electron-updater.
  managedRuntime =
    process.platform === 'linux' &&
    (Boolean(process.env.FLATPAK_ID) || existsSync('/.flatpak-info') || Boolean(process.env.SNAP))
  if (managedRuntime) {
    emit({ type: 'unavailable-managed' })
    return
  }

  // Remove downloads left behind by a previous update run.
  try {
    const dir = updaterCacheDir()
    if (dir) cleanupUpdateDir(dir, app.getVersion())
  } catch {
    // best effort
  }

  try {
    const mod = (await import('electron-updater')) as {
      autoUpdater?: AppUpdater
      default?: { autoUpdater?: AppUpdater }
    }
    const autoUpdater = mod.autoUpdater ?? mod.default?.autoUpdater
    if (!autoUpdater) {
      emit({ type: 'error', error: 'electron-updater did not expose autoUpdater' })
      return
    }
    updater = autoUpdater
    // Opt-in download; once the user asks to install, apply it on quit too.
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('checking-for-update', () => emit({ type: 'checking' }))
    autoUpdater.on('update-available', (info) => emit({ type: 'available', version: info.version }))
    autoUpdater.on('update-not-available', () => emit({ type: 'none' }))
    autoUpdater.on('download-progress', (p) =>
      emit({ type: 'progress', percent: Math.round(p.percent) })
    )
    autoUpdater.on('update-downloaded', (info) => emit({ type: 'downloaded', version: info.version }))
    autoUpdater.on('error', (err) => {
      // While we're retrying a transient failure, stay quiet until all attempts fail.
      if (retrying) return
      emit({ type: 'error', error: String(err?.message ?? err) })
    })

    void autoUpdater.checkForUpdates().catch(() => undefined)
  } catch (error) {
    emit({ type: 'error', error: (error as Error).message })
  }
}

let retrying = false

/**
 * GitHub occasionally answers a release-asset request with a transient 5xx
 * (often right after publishing, while the large installer replicates). Retry a
 * few times with backoff so the update heals itself instead of failing.
 */
async function withRetry<T>(run: () => Promise<T>, attempts = 3): Promise<T> {
  retrying = true
  let lastError: unknown
  try {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await run()
      } catch (error) {
        lastError = error
        if (attempt < attempts) await new Promise((r) => setTimeout(r, 1200 * attempt))
      }
    }
    throw lastError
  } finally {
    retrying = false
  }
}

export async function checkForUpdates(): Promise<void> {
  if (managedRuntime) {
    emit({ type: 'unavailable-managed' })
    return
  }
  if (!updater) {
    emit({
      type: 'error',
      error: app.isPackaged
        ? 'Update system failed to initialise'
        : 'Updates are disabled in development builds'
    })
    return
  }
  const active = updater
  try {
    await withRetry(() => active.checkForUpdates())
  } catch (error) {
    emit({ type: 'error', error: (error as Error).message })
  }
}

export async function downloadUpdate(): Promise<void> {
  if (!updater) {
    emit({ type: 'error', error: 'Update system is not ready yet — try again in a moment.' })
    return
  }
  const active = updater
  try {
    await withRetry(() => active.downloadUpdate())
  } catch (error) {
    emit({
      type: 'error',
      error: `${(error as Error).message} — the download may have been interrupted. Please try again.`
    })
  }
}

export function installUpdate(): void {
  if (!updater) {
    emit({ type: 'error', error: 'Update system is not ready yet — try again in a moment.' })
    return
  }
  try {
    // Force-run after install, and stand down close-to-tray so the app really quits.
    forceQuit()
    updater.quitAndInstall(false, true)
  } catch (error) {
    emit({ type: 'error', error: (error as Error).message })
    // Quitting will still apply the downloaded update (autoInstallOnAppQuit).
    app.quit()
  }
}
