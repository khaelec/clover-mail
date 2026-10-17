import { app, nativeImage, shell, type BrowserWindow } from 'electron'
import { ipcHost as ipcMain } from '@main/ipcHost'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { IpcChannels } from '@shared/channels'
import { AppInfoSchema, type AppInfo } from '@shared/ipc'
import { getAllSettings, getSetting, setSetting, deleteSetting } from '@core/settings'
import { registerMailIpc } from './mail'
import { registerContactsIpc } from './contacts'
import { registerMessageWindowIpc } from './messageWindow'
import { registerAppsIpc } from './apps'
import { registerCalendarIpc } from './calendar'
import { registerAiIpc } from './ai'
import { registerWallpaperIpc } from './wallpaper'
import { registerUpdateIpc } from './update'
import { registerBackupIpc } from './backup'
import { registerDictationIpc } from './dictation'
import { setTrayUnread } from '@main/tray'
import { readRecentLogs } from '@core/log'
import { listNotifications, saveNotifications } from '@core/notifications'
import type { StoredNotification } from '@shared/notifications'

export function registerIpc(
  getWindow: () => BrowserWindow | null,
  forceQuit: () => void
): void {
  ipcMain.handle(IpcChannels.appInfo, (): AppInfo => {
    return AppInfoSchema.parse({
      name: app.getName(),
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      platform: process.platform,
      userDataPath: app.getPath('userData'),
      isPackaged: app.isPackaged
    })
  })

  ipcMain.handle(IpcChannels.settingsGetAll, () => getAllSettings())
  ipcMain.handle(IpcChannels.settingsGet, (_event, key: string) => getSetting(key))
  ipcMain.handle(IpcChannels.settingsSet, (_event, key: string, value: unknown) => {
    setSetting(key, value)
  })
  ipcMain.handle(IpcChannels.settingsDelete, (_event, key: string) => {
    deleteSetting(key)
  })

  ipcMain.handle(IpcChannels.windowIsMaximized, () => getWindow()?.isMaximized() ?? false)

  ipcMain.on(IpcChannels.windowMinimize, () => getWindow()?.minimize())
  ipcMain.on(IpcChannels.windowToggleMaximize, () => {
    const win = getWindow()
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on(IpcChannels.windowClose, () => getWindow()?.close())
  ipcMain.on(IpcChannels.appSetUnread, (_event, count: number) => {
    setTrayUnread(count)
    // Windows uses the overlay icon; macOS/Linux use the native badge count.
    if (process.platform !== 'win32') app.setBadgeCount(Math.max(0, count))
  })
  ipcMain.on(IpcChannels.appSetTaskbarBadge, (_event, dataUrl: string, text: string) => {
    if (process.platform !== 'win32') return
    const win = getWindow()
    if (!win) return
    if (!dataUrl) {
      win.setOverlayIcon(null, '')
      return
    }
    try {
      win.setOverlayIcon(nativeImage.createFromDataURL(dataUrl), text)
    } catch {
      // ignore an invalid badge image
    }
  })

  ipcMain.handle(IpcChannels.appOpenLicenses, async () => {
    const candidates = app.isPackaged
      ? [join(process.resourcesPath, 'THIRD-PARTY-NOTICES.txt')]
      : [
          join(app.getAppPath(), 'THIRD-PARTY-NOTICES.txt'),
          join(process.cwd(), 'THIRD-PARTY-NOTICES.txt')
        ]
    const file = candidates.find((candidate) => existsSync(candidate))
    if (!file) return { opened: false, path: '' }
    const error = await shell.openPath(file)
    return { opened: !error, path: file }
  })

  // Read the notices in-process so the viewer works even when the OS can't open
  // the file (e.g. inside a Flatpak sandbox with no text editor).
  ipcMain.handle(IpcChannels.appReadLicenses, () => {
    const candidates = app.isPackaged
      ? [join(process.resourcesPath, 'THIRD-PARTY-NOTICES.txt')]
      : [
          join(app.getAppPath(), 'THIRD-PARTY-NOTICES.txt'),
          join(process.cwd(), 'THIRD-PARTY-NOTICES.txt')
        ]
    const file = candidates.find((candidate) => existsSync(candidate))
    if (!file) return null
    try {
      return readFileSync(file, 'utf8')
    } catch {
      return null
    }
  })

  ipcMain.handle(IpcChannels.appReadLogs, (_e, limit?: number) => readRecentLogs(limit ?? 200))

  ipcMain.handle(IpcChannels.notificationsList, () => listNotifications())
  ipcMain.handle(IpcChannels.notificationsSave, (_e, items: StoredNotification[]) =>
    saveNotifications(items)
  )

  registerMailIpc(getWindow)
  registerContactsIpc()
  registerMessageWindowIpc(getWindow)
  registerAppsIpc()
  registerCalendarIpc()
  registerAiIpc(getWindow)
  registerWallpaperIpc()
  registerUpdateIpc(getWindow, forceQuit)
  registerBackupIpc(getWindow)
  registerDictationIpc(getWindow)
}
