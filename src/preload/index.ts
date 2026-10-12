import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IpcChannels } from '@shared/channels'
import type { CloverApi } from '@shared/ipc'

const api: CloverApi = {
  appInfo: () => ipcRenderer.invoke(IpcChannels.appInfo),
  getFilePath: (file) =>
    webUtils.getPathForFile(file as Parameters<typeof webUtils.getPathForFile>[0]),
  apps: {
    list: () => ipcRenderer.invoke(IpcChannels.apps.list),
    create: (input) => ipcRenderer.invoke(IpcChannels.apps.create, input),
    remove: (id) => ipcRenderer.invoke(IpcChannels.apps.remove, id),
    update: (id, patch) => ipcRenderer.invoke(IpcChannels.apps.update, id, patch)
  },
  calendar: {
    listCalendars: () => ipcRenderer.invoke(IpcChannels.calendar.listCalendars),
    createCalendar: (name, color) =>
      ipcRenderer.invoke(IpcChannels.calendar.createCalendar, name, color),
    listOccurrences: (startUtc, endUtc) =>
      ipcRenderer.invoke(IpcChannels.calendar.listOccurrences, startUtc, endUtc),
    getEvent: (id) => ipcRenderer.invoke(IpcChannels.calendar.getEvent, id),
    createEvent: (input) => ipcRenderer.invoke(IpcChannels.calendar.createEvent, input),
    updateEvent: (id, input) => ipcRenderer.invoke(IpcChannels.calendar.updateEvent, id, input),
    deleteEvent: (id) => ipcRenderer.invoke(IpcChannels.calendar.deleteEvent, id),
    importPath: (path) => ipcRenderer.invoke(IpcChannels.calendar.importPath, path),
    importAttachment: (attachmentId) =>
      ipcRenderer.invoke(IpcChannels.calendar.importAttachment, attachmentId),
    pickAndImport: () => ipcRenderer.invoke(IpcChannels.calendar.pickAndImport),
    exportIcs: (calendarId) => ipcRenderer.invoke(IpcChannels.calendar.exportIcs, calendarId)
  },
  ai: {
    getSettings: () => ipcRenderer.invoke(IpcChannels.ai.getSettings),
    setSettings: (patch) => ipcRenderer.invoke(IpcChannels.ai.setSettings, patch),
    status: () => ipcRenderer.invoke(IpcChannels.ai.status),
    listModels: (provider) => ipcRenderer.invoke(IpcChannels.ai.listModels, provider),
    chat: (request) => ipcRenderer.invoke(IpcChannels.ai.chat, request),
    cancel: (streamId) => ipcRenderer.invoke(IpcChannels.ai.cancel, streamId),
    onStream: (cb) => {
      const listener = (_event: Electron.IpcRendererEvent, event: unknown): void =>
        cb(event as Parameters<typeof cb>[0])
      ipcRenderer.on(IpcChannels.ai.stream, listener)
      return () => ipcRenderer.removeListener(IpcChannels.ai.stream, listener)
    },
    getMcpSettings: () => ipcRenderer.invoke(IpcChannels.ai.getMcpSettings),
    setMcpSettings: (patch) => ipcRenderer.invoke(IpcChannels.ai.setMcpSettings, patch),
    mcpStart: () => ipcRenderer.invoke(IpcChannels.ai.mcpStart),
    mcpStop: () => ipcRenderer.invoke(IpcChannels.ai.mcpStop)
  },
  wallpaper: {
    pickFile: (kind) => ipcRenderer.invoke(IpcChannels.wallpaper.pickFile, kind),
    pickFolder: () => ipcRenderer.invoke(IpcChannels.wallpaper.pickFolder),
    listFolder: (path) => ipcRenderer.invoke(IpcChannels.wallpaper.listFolder, path),
    detectEngine: () => ipcRenderer.invoke(IpcChannels.wallpaper.detectEngine)
  },
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
    listThreads: (folderId, limit) =>
      ipcRenderer.invoke(IpcChannels.mail.listThreads, folderId, limit),
    listJunk: (accountId) => ipcRenderer.invoke(IpcChannels.mail.listJunk, accountId),
    spamCount: (accountId) => ipcRenderer.invoke(IpcChannels.mail.spamCount, accountId),
    listImportant: (accountId) => ipcRenderer.invoke(IpcChannels.mail.listImportant, accountId),
    importantCount: (accountId) => ipcRenderer.invoke(IpcChannels.mail.importantCount, accountId),
    markSpam: (messageId) => ipcRenderer.invoke(IpcChannels.mail.markSpam, messageId),
    markNotSpam: (messageId) => ipcRenderer.invoke(IpcChannels.mail.markNotSpam, messageId),
    blockSender: (accountId, email) =>
      ipcRenderer.invoke(IpcChannels.mail.blockSender, accountId, email),
    allowSender: (accountId, email) =>
      ipcRenderer.invoke(IpcChannels.mail.allowSender, accountId, email),
    createFolder: (input) => ipcRenderer.invoke(IpcChannels.mail.createFolder, input),
    renameFolder: (folderId, newName) =>
      ipcRenderer.invoke(IpcChannels.mail.renameFolder, folderId, newName),
    deleteFolder: (folderId) => ipcRenderer.invoke(IpcChannels.mail.deleteFolder, folderId),
    listRules: (accountId) => ipcRenderer.invoke(IpcChannels.mail.listRules, accountId),
    createRule: (accountId, input) => ipcRenderer.invoke(IpcChannels.mail.createRule, accountId, input),
    updateRule: (ruleId, input) => ipcRenderer.invoke(IpcChannels.mail.updateRule, ruleId, input),
    deleteRule: (ruleId) => ipcRenderer.invoke(IpcChannels.mail.deleteRule, ruleId),
    applyRules: (accountId) => ipcRenderer.invoke(IpcChannels.mail.applyRules, accountId),
    getMessage: (messageId) => ipcRenderer.invoke(IpcChannels.mail.getMessage, messageId),
    setFlags: (messageId, flags) =>
      ipcRenderer.invoke(IpcChannels.mail.setFlags, messageId, flags),
    moveMessage: (messageId, targetFolderId) =>
      ipcRenderer.invoke(IpcChannels.mail.moveMessage, messageId, targetFolderId),
    deleteMessage: (messageId) => ipcRenderer.invoke(IpcChannels.mail.deleteMessage, messageId),
    bulkAction: (input) => ipcRenderer.invoke(IpcChannels.mail.bulkAction, input),
    emptyFolder: (folderId) => ipcRenderer.invoke(IpcChannels.mail.emptyFolder, folderId),
    markFolderRead: (folderId) => ipcRenderer.invoke(IpcChannels.mail.markFolderRead, folderId),
    deleteSpam: (accountId) => ipcRenderer.invoke(IpcChannels.mail.deleteSpam, accountId),
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
