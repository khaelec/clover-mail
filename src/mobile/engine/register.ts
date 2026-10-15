import { IpcChannels } from '@shared/channels'
import { AppInfoSchema } from '@shared/ipc'
import { getAllSettings, getSetting, setSetting, deleteSetting } from '@core/settings'
import { listNotifications, saveNotifications } from '@core/notifications'
import type { StoredNotification } from '@shared/notifications'
import { registerMailIpc } from '@main/ipc/mail'
import { ipcHost as ipcMain } from './ipcHost'

/**
 * Registers the channel handlers the phone needs: mail, settings, notifications
 * and app info. Desktop-only handlers (AI, apps, wallpapers, dictation, tray,
 * updater, backup) are not registered here. `@main/ipc/mail` is reused as-is —
 * the bundle aliases its Electron imports (`@main/ipcHost`, `@main/mail/events`,
 * `@main/oauth`) to the Electron-free shims beside this file.
 */
export function registerAndroidHandlers(info: { version: string; dataDir: string }): void {
  ipcMain.handle(IpcChannels.appInfo, () =>
    AppInfoSchema.parse({
      name: 'Clover Mail',
      version: info.version,
      electron: '',
      chrome: '',
      node: process.versions.node,
      platform: process.platform,
      userDataPath: info.dataDir,
      isPackaged: true
    })
  )

  ipcMain.handle(IpcChannels.settingsGetAll, () => getAllSettings())
  ipcMain.handle(IpcChannels.settingsGet, (_e: unknown, key: string) => getSetting(key))
  ipcMain.handle(IpcChannels.settingsSet, (_e: unknown, key: string, value: unknown) => {
    setSetting(key, value)
  })
  ipcMain.handle(IpcChannels.settingsDelete, (_e: unknown, key: string) => {
    deleteSetting(key)
  })

  ipcMain.handle(IpcChannels.notificationsList, () => listNotifications())
  ipcMain.handle(IpcChannels.notificationsSave, (_e: unknown, items: StoredNotification[]) =>
    saveNotifications(items)
  )

  registerMailIpc(() => null)
}
