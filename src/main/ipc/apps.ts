import { ipcHost as ipcMain } from '@main/ipcHost'
import { IpcChannels } from '@shared/channels'
import type { CreateAppInput, CustomApp } from '@shared/apps'
import { createApp, listApps, removeApp, updateApp } from '@main/apps'

export function registerAppsIpc(): void {
  ipcMain.handle(IpcChannels.apps.list, () => listApps())
  ipcMain.handle(IpcChannels.apps.create, (_e, input: CreateAppInput) => createApp(input))
  ipcMain.handle(IpcChannels.apps.remove, (_e, id: string) => removeApp(id))
  ipcMain.handle(IpcChannels.apps.update, (_e, id: string, patch: Partial<CustomApp>) =>
    updateApp(id, patch)
  )
}
