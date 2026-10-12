import { app, type BrowserWindow } from 'electron'
import { join } from 'node:path'
import type { AppUpdater } from 'electron-updater'
import type { UpdateEvent } from '@shared/ipc'
import { cleanupUpdateDir } from './updateCleanup'

let updater: AppUpdater | null = null
let getWindow: () => BrowserWindow | null = () => null
let initialized = false
let forceQuit: () => void = () => undefined

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

export async function initUpdater(): Promise<void> {
  if (initialized) return
  initialized = true
  if (!app.isPackaged) {
    emit({ type: 'unavailable-dev' })
    return
  }

  // Remove downloads left behind by a previous update run.
  try {
    const local = process.env.LOCALAPPDATA
    if (local) cleanupUpdateDir(join(local, `${app.getName()}-updater`), app.getVersion())
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
    autoUpdater.on('error', (err) => emit({ type: 'error', error: String(err?.message ?? err) }))

    void autoUpdater.checkForUpdates().catch(() => undefined)
  } catch (error) {
    emit({ type: 'error', error: (error as Error).message })
  }
}

export async function checkForUpdates(): Promise<void> {
  if (!updater) {
    emit({
      type: 'error',
      error: app.isPackaged
        ? 'Update system failed to initialise'
        : 'Updates are disabled in development builds'
    })
    return
  }
  try {
    await updater.checkForUpdates()
  } catch (error) {
    emit({ type: 'error', error: (error as Error).message })
  }
}

export async function downloadUpdate(): Promise<void> {
  try {
    await updater?.downloadUpdate()
  } catch (error) {
    emit({ type: 'error', error: (error as Error).message })
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
