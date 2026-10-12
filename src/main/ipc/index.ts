import { app, ipcMain, type BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/channels'
import { AppInfoSchema, type AppInfo } from '@shared/ipc'
import { getAllSettings, getSetting, setSetting, deleteSetting } from '@main/settings'
import { registerMailIpc } from './mail'
import { registerAppsIpc } from './apps'
import { registerCalendarIpc } from './calendar'
import { registerAiIpc } from './ai'

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IpcChannels.appInfo, (): AppInfo => {
    return AppInfoSchema.parse({
      name: app.getName(),
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      platform: process.platform,
      userDataPath: app.getPath('userData')
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

  registerMailIpc(getWindow)
  registerAppsIpc()
  registerCalendarIpc()
  registerAiIpc(getWindow)
}
