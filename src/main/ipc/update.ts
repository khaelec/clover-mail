import { ipcMain, type BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/channels'
import { checkForUpdates, downloadUpdate, initUpdater, installUpdate, setUpdateWindow } from '@main/updater'

export function registerUpdateIpc(getWindow: () => BrowserWindow | null): void {
  setUpdateWindow(getWindow)
  ipcMain.handle(IpcChannels.update.check, () => checkForUpdates())
  ipcMain.handle(IpcChannels.update.download, () => downloadUpdate())
  ipcMain.handle(IpcChannels.update.install, () => installUpdate())
}

export { initUpdater }
