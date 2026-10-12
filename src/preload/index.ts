import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IpcChannels } from '@shared/channels'
import type { CloverApi } from '@shared/ipc'

const api: CloverApi = {
  appInfo: () => ipcRenderer.invoke(IpcChannels.appInfo),
  getFilePath: (file) =>
    webUtils.getPathForFile(file as Parameters<typeof webUtils.getPathForFile>[0]),
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
  },
  mail: {
    listAccounts: () => ipcRenderer.invoke(IpcChannels.mail.listAccounts),
    createAccount: (input) => ipcRenderer.invoke(IpcChannels.mail.createAccount, input),
    updateAccount: (id, input) => ipcRenderer.invoke(IpcChannels.mail.updateAccount, id, input),
    deleteAccount: (id) => ipcRenderer.invoke(IpcChannels.mail.deleteAccount, id),
    testConnection: (input) => ipcRenderer.invoke(IpcChannels.mail.testConnection, input),
    syncAccount: (accountId) => ipcRenderer.invoke(IpcChannels.mail.syncAccount, accountId),
    syncFolder: (folderId) => ipcRenderer.invoke(IpcChannels.mail.syncFolder, folderId),
    listFolders: (accountId) => ipcRenderer.invoke(IpcChannels.mail.listFolders, accountId),
    listMessages: (folderId, limit, offset) =>
      ipcRenderer.invoke(IpcChannels.mail.listMessages, folderId, limit, offset),
    listJunk: (accountId) => ipcRenderer.invoke(IpcChannels.mail.listJunk, accountId),
    spamCount: (accountId) => ipcRenderer.invoke(IpcChannels.mail.spamCount, accountId),
    markSpam: (messageId) => ipcRenderer.invoke(IpcChannels.mail.markSpam, messageId),
    markNotSpam: (messageId) => ipcRenderer.invoke(IpcChannels.mail.markNotSpam, messageId),
    blockSender: (accountId, email) =>
      ipcRenderer.invoke(IpcChannels.mail.blockSender, accountId, email),
    allowSender: (accountId, email) =>
      ipcRenderer.invoke(IpcChannels.mail.allowSender, accountId, email),
    getMessage: (messageId) => ipcRenderer.invoke(IpcChannels.mail.getMessage, messageId),
    setFlags: (messageId, flags) =>
      ipcRenderer.invoke(IpcChannels.mail.setFlags, messageId, flags),
    moveMessage: (messageId, targetFolderId) =>
      ipcRenderer.invoke(IpcChannels.mail.moveMessage, messageId, targetFolderId),
    deleteMessage: (messageId) => ipcRenderer.invoke(IpcChannels.mail.deleteMessage, messageId),
    sendMessage: (input) => ipcRenderer.invoke(IpcChannels.mail.sendMessage, input),
    downloadAttachment: (attachmentId) =>
      ipcRenderer.invoke(IpcChannels.mail.downloadAttachment, attachmentId),
    search: (query, accountId) => ipcRenderer.invoke(IpcChannels.mail.search, query, accountId),
    onEvent: (cb) => {
      const listener = (_event: Electron.IpcRendererEvent, event: unknown): void =>
        cb(event as Parameters<typeof cb>[0])
      ipcRenderer.on(IpcChannels.mail.events, listener)
      return () => ipcRenderer.removeListener(IpcChannels.mail.events, listener)
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
