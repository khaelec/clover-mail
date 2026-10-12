import { app, type BrowserWindow } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppUpdater } from 'electron-updater'
import type { UpdateEvent } from '@shared/ipc'

let updater: AppUpdater | null = null
let getWindow: () => BrowserWindow | null = () => null
let initialized = false

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

  try {
    const { autoUpdater } = await import('electron-updater')
    updater = autoUpdater
    // Opt-in: never download or install without the user asking.
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false

    // Personal builds ship a read-only token for the private update feed.
    const tokenFile = join(process.resourcesPath, 'updater-token.txt')
    if (existsSync(tokenFile)) {
      const token = readFileSync(tokenFile, 'utf8').trim()
      if (token && !token.startsWith('PASTE')) {
        autoUpdater.setFeedURL({
          provider: 'github',
          owner: 'khaelec',
          repo: 'clover-mail-personal',
          private: true,
          token
        })
      }
    }

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
    emit({ type: 'unavailable-dev' })
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
  updater?.quitAndInstall()
}
