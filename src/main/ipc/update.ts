import type { BrowserWindow } from 'electron'
import { ipcHost as ipcMain } from '@main/ipcHost'
import { IpcChannels } from '@shared/channels'
import {
  checkForUpdates,
  downloadUpdate,
  initUpdater,
  installUpdate,
  setForceQuit,
  setUpdateWindow
} from '@main/updater'

export function registerUpdateIpc(
  getWindow: () => BrowserWindow | null,
  forceQuit: () => void
): void {
  setUpdateWindow(getWindow)
  setForceQuit(forceQuit)
  ipcMain.handle(IpcChannels.update.check, () => checkForUpdates())
  ipcMain.handle(IpcChannels.update.download, () => downloadUpdate())
  ipcMain.handle(IpcChannels.update.install, () => installUpdate())
}

export { initUpdater }
