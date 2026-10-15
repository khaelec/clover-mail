import type { BrowserWindow } from 'electron'
import { ipcHost as ipcMain } from '@main/ipcHost'
import { IpcChannels } from '@shared/channels'
import { exportBackup, importBackup } from '@main/backup'

export function registerBackupIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IpcChannels.backup.export, (_e, includeAttachments: boolean) =>
    exportBackup(getWindow(), includeAttachments)
  )
  ipcMain.handle(IpcChannels.backup.import, () => importBackup(getWindow()))
}
