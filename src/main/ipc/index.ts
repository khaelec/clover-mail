import { app, ipcMain, shell, type BrowserWindow } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { IpcChannels } from '@shared/channels'
import { AppInfoSchema, type AppInfo } from '@shared/ipc'
import { getAllSettings, getSetting, setSetting, deleteSetting } from '@main/settings'
import { registerMailIpc } from './mail'
import { registerAppsIpc } from './apps'
import { registerCalendarIpc } from './calendar'
import { registerAiIpc } from './ai'
import { registerWallpaperIpc } from './wallpaper'
import { registerUpdateIpc } from './update'
import { registerBackupIpc } from './backup'
import { registerDictationIpc } from './dictation'
import { setTrayUnread } from '@main/tray'

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
  ipcMain.on(IpcChannels.appSetUnread, (_event, count: number) => setTrayUnread(count))

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

  registerMailIpc(getWindow)
  registerAppsIpc()
  registerCalendarIpc()
  registerAiIpc(getWindow)
  registerWallpaperIpc()
  registerUpdateIpc(getWindow, forceQuit)
  registerBackupIpc(getWindow)
  registerDictationIpc(getWindow)
}
