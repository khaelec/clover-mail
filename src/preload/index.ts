import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IpcChannels } from '@shared/channels'
import type { CloverApi } from '@shared/ipc'

const api: CloverApi = {
  appInfo: () => ipcRenderer.invoke(IpcChannels.appInfo),
  settings: {
    getAll: () => ipcRenderer.invoke(IpcChannels.settingsGetAll),
    get: (key: string) => ipcRenderer.invoke(IpcChannels.settingsGet, key),
    set: (key: string, value: unknown) => ipcRenderer.invoke(IpcChannels.settingsSet, key, value),
    delete: (key: string) => ipcRenderer.invoke(IpcChannels.settingsDelete, key)
  },
  window: {
    minimize: () => ipcRenderer.send(IpcChannels.windowMinimize),
    toggleMaximize: () => ipcRenderer.send(IpcChannels.windowToggleMaximize),
    close: () => ipcRenderer.send(IpcChannels.windowClose),
    isMaximized: () => ipcRenderer.invoke(IpcChannels.windowIsMaximized),
    onMaximizedChanged: (cb) => {
      const listener = (_event: Electron.IpcRendererEvent, maximized: boolean): void =>
        cb(maximized)
      ipcRenderer.on(IpcChannels.windowMaximizedChanged, listener)
      return () => ipcRenderer.removeListener(IpcChannels.windowMaximizedChanged, listener)
    }
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('clover', api)
} else {
  // @ts-expect-error fallback when context isolation is disabled
  window.electron = electronAPI
  // @ts-expect-error fallback when context isolation is disabled
  window.clover = api
}
