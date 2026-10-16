/* eslint-disable @typescript-eslint/no-explicit-any */
import { IpcChannels } from './channels'
import type { CloverApi } from './ipc'

/**
 * Builds the `window.clover` API against any host transport. The Electron preload
 * passes ipcRenderer. Keeps the method→channel mappings in one place so a client
 * only has to supply a host (invoke/send/on) to get the whole API.
 */
export interface CloverHost {
  invoke: (channel: string, ...args: any[]) => Promise<any>
  send: (channel: string, ...args: any[]) => void
  on: (channel: string, cb: (...args: any[]) => void) => () => void
  getFilePath: (file: any) => string
}

export function buildCloverApi(host: CloverHost): CloverApi {
  const { invoke, send, on, getFilePath } = host
  return {
    appInfo: () => invoke(IpcChannels.appInfo),
    getFilePath: (file) => getFilePath(file),
    setUnread: (count) => send(IpcChannels.appSetUnread, count),
    setTaskbarBadge: (dataUrl, text) => send(IpcChannels.appSetTaskbarBadge, dataUrl, text),
    openLicenses: () => invoke(IpcChannels.appOpenLicenses),
    readLicenses: () => invoke(IpcChannels.appReadLicenses),
    readLogs: (limit) => invoke(IpcChannels.appReadLogs, limit),
    notifications: {
      list: () => invoke(IpcChannels.notificationsList),
      save: (items) => invoke(IpcChannels.notificationsSave, items),
      onNotify: (cb) => on(IpcChannels.appNotify, cb)
    },
    onNavigate: (cb) => on(IpcChannels.appNavigate, cb),
    onOpenMessage: (cb) => on(IpcChannels.appOpenMessage, cb),
    contacts: {
      list: (scope, query) => invoke(IpcChannels.contacts.list, scope, query),
      suggest: (query, limit) => invoke(IpcChannels.contacts.suggest, query, limit),
      save: (input, id) => invoke(IpcChannels.contacts.save, input, id),
      remove: (id) => invoke(IpcChannels.contacts.remove, id),
      importFile: () => invoke(IpcChannels.contacts.importFile),
      exportFile: () => invoke(IpcChannels.contacts.exportFile)
    },
    apps: {
      list: () => invoke(IpcChannels.apps.list),
      create: (input) => invoke(IpcChannels.apps.create, input),
      remove: (id) => invoke(IpcChannels.apps.remove, id),
      update: (id, patch) => invoke(IpcChannels.apps.update, id, patch)
    },
    calendar: {
      listCalendars: () => invoke(IpcChannels.calendar.listCalendars),
      createCalendar: (name, color) => invoke(IpcChannels.calendar.createCalendar, name, color),
      listOccurrences: (startUtc, endUtc) =>
        invoke(IpcChannels.calendar.listOccurrences, startUtc, endUtc),
      getEvent: (id) => invoke(IpcChannels.calendar.getEvent, id),
      createEvent: (input) => invoke(IpcChannels.calendar.createEvent, input),
      updateEvent: (id, input) => invoke(IpcChannels.calendar.updateEvent, id, input),
      deleteEvent: (id) => invoke(IpcChannels.calendar.deleteEvent, id),
      importPath: (path) => invoke(IpcChannels.calendar.importPath, path),
      importAttachment: (attachmentId) =>
        invoke(IpcChannels.calendar.importAttachment, attachmentId),
      pickAndImport: () => invoke(IpcChannels.calendar.pickAndImport),
      exportIcs: (calendarId) => invoke(IpcChannels.calendar.exportIcs, calendarId),
      addCaldav: (name, url, username, password) =>
        invoke(IpcChannels.calendar.addCaldav, name, url, username, password),
      syncCalendar: (calendarId) => invoke(IpcChannels.calendar.syncCalendar, calendarId),
      removeCalendar: (calendarId) => invoke(IpcChannels.calendar.removeCalendar, calendarId)
    },
    ai: {
      getSettings: () => invoke(IpcChannels.ai.getSettings),
      setSettings: (patch) => invoke(IpcChannels.ai.setSettings, patch),
      status: () => invoke(IpcChannels.ai.status),
      listModels: (provider) => invoke(IpcChannels.ai.listModels, provider),
      chat: (request) => invoke(IpcChannels.ai.chat, request),
      cancel: (streamId) => invoke(IpcChannels.ai.cancel, streamId),
      onStream: (cb) => on(IpcChannels.ai.stream, cb),
      getMcpSettings: () => invoke(IpcChannels.ai.getMcpSettings),
      setMcpSettings: (patch) => invoke(IpcChannels.ai.setMcpSettings, patch),
      mcpStart: () => invoke(IpcChannels.ai.mcpStart),
      mcpStop: () => invoke(IpcChannels.ai.mcpStop)
    },
    wallpaper: {
      pickFile: (kind) => invoke(IpcChannels.wallpaper.pickFile, kind),
      pickFolder: () => invoke(IpcChannels.wallpaper.pickFolder),
      listFolder: (path) => invoke(IpcChannels.wallpaper.listFolder, path),
      detectEngine: () => invoke(IpcChannels.wallpaper.detectEngine)
    },
    update: {
      check: () => invoke(IpcChannels.update.check),
      download: () => invoke(IpcChannels.update.download),
      install: () => invoke(IpcChannels.update.install),
      onEvent: (cb) => on(IpcChannels.update.event, cb)
    },
    backup: {
      exportBackup: (includeAttachments) => invoke(IpcChannels.backup.export, includeAttachments),
      importBackup: () => invoke(IpcChannels.backup.import)
    },
    dictation: {
      start: () => invoke(IpcChannels.dictation.start),
      stop: () => send(IpcChannels.dictation.stop),
      supported: () => invoke(IpcChannels.dictation.supported),
      onEvent: (cb) => on(IpcChannels.dictation.event, cb)
    },
    settings: {
      getAll: () => invoke(IpcChannels.settingsGetAll),
      get: (key: string) => invoke(IpcChannels.settingsGet, key),
      set: (key: string, value: unknown) => invoke(IpcChannels.settingsSet, key, value),
      delete: (key: string) => invoke(IpcChannels.settingsDelete, key)
    },
    window: {
      minimize: () => send(IpcChannels.windowMinimize),
      toggleMaximize: () => send(IpcChannels.windowToggleMaximize),
      close: () => send(IpcChannels.windowClose),
      isMaximized: () => invoke(IpcChannels.windowIsMaximized),
      onMaximizedChanged: (cb) => on(IpcChannels.windowMaximizedChanged, cb)
    },
    mail: {
      listAccounts: () => invoke(IpcChannels.mail.listAccounts),
      createAccount: (input) => invoke(IpcChannels.mail.createAccount, input),
      updateAccount: (id, input) => invoke(IpcChannels.mail.updateAccount, id, input),
      deleteAccount: (id) => invoke(IpcChannels.mail.deleteAccount, id),
      testConnection: (input) => invoke(IpcChannels.mail.testConnection, input),
      syncAccount: (accountId) => invoke(IpcChannels.mail.syncAccount, accountId),
      syncFolder: (folderId) => invoke(IpcChannels.mail.syncFolder, folderId),
      listFolders: (accountId) => invoke(IpcChannels.mail.listFolders, accountId),
      listMessages: (folderId, limit, offset) =>
        invoke(IpcChannels.mail.listMessages, folderId, limit, offset),
      listThreads: (folderId, limit) => invoke(IpcChannels.mail.listThreads, folderId, limit),
      hasOlderMessages: (folderId, limit) =>
        invoke(IpcChannels.mail.hasOlderMessages, folderId, limit),
      notificationStatus: (ids) => invoke(IpcChannels.mail.notificationStatus, ids),
      listJunk: (accountId) => invoke(IpcChannels.mail.listJunk, accountId),
      spamCount: (accountId) => invoke(IpcChannels.mail.spamCount, accountId),
      listImportant: (accountId) => invoke(IpcChannels.mail.listImportant, accountId),
      importantCount: (accountId) => invoke(IpcChannels.mail.importantCount, accountId),
      listUnifiedThreads: (limit) => invoke(IpcChannels.mail.listUnifiedThreads, limit),
      listUnifiedMessages: (limit) => invoke(IpcChannels.mail.listUnifiedMessages, limit),
      markSpam: (messageId) => invoke(IpcChannels.mail.markSpam, messageId),
      markNotSpam: (messageId) => invoke(IpcChannels.mail.markNotSpam, messageId),
      blockSender: (accountId, email) => invoke(IpcChannels.mail.blockSender, accountId, email),
      allowSender: (accountId, email) => invoke(IpcChannels.mail.allowSender, accountId, email),
      createFolder: (input) => invoke(IpcChannels.mail.createFolder, input),
      renameFolder: (folderId, newName) =>
        invoke(IpcChannels.mail.renameFolder, folderId, newName),
      deleteFolder: (folderId) => invoke(IpcChannels.mail.deleteFolder, folderId),
      setFolderVisible: (folderId, visible) =>
        invoke(IpcChannels.mail.setFolderVisible, folderId, visible),
      exportMbox: (folderId) => invoke(IpcChannels.mail.exportMbox, folderId),
      listAliases: (accountId) => invoke(IpcChannels.mail.listAliases, accountId),
      addAlias: (accountId, email, name) => invoke(IpcChannels.mail.addAlias, accountId, email, name),
      deleteAlias: (aliasId) => invoke(IpcChannels.mail.deleteAlias, aliasId),
      getDefaultFrom: (accountId) => invoke(IpcChannels.mail.getDefaultFrom, accountId),
      setDefaultFrom: (accountId, email) =>
        invoke(IpcChannels.mail.setDefaultFrom, accountId, email),
      startGoogleOAuth: () => invoke(IpcChannels.mail.oauthStart),
      googleConfigured: () => invoke(IpcChannels.mail.oauthGoogleConfigured),
      getGoogleConfig: () => invoke(IpcChannels.mail.oauthGetGoogleConfig),
      setGoogleConfig: (clientId, clientSecret) =>
        invoke(IpcChannels.mail.oauthSetGoogleConfig, clientId, clientSecret),
      startMicrosoftOAuth: () => invoke(IpcChannels.mail.oauthStartMicrosoft),
      microsoftConfigured: () => invoke(IpcChannels.mail.oauthMicrosoftConfigured),
      getMicrosoftConfig: () => invoke(IpcChannels.mail.oauthGetMicrosoftConfig),
      setMicrosoftConfig: (clientId, clientSecret) =>
        invoke(IpcChannels.mail.oauthSetMicrosoftConfig, clientId, clientSecret),
      listRules: (accountId) => invoke(IpcChannels.mail.listRules, accountId),
      createRule: (accountId, input) => invoke(IpcChannels.mail.createRule, accountId, input),
      updateRule: (ruleId, input) => invoke(IpcChannels.mail.updateRule, ruleId, input),
      deleteRule: (ruleId) => invoke(IpcChannels.mail.deleteRule, ruleId),
      applyRules: (accountId) => invoke(IpcChannels.mail.applyRules, accountId),
      getMessage: (messageId) => invoke(IpcChannels.mail.getMessage, messageId),
      locateMessage: (messageId, threadId) =>
        invoke(IpcChannels.mail.locateMessage, messageId, threadId),
      getConversation: (messageId) => invoke(IpcChannels.mail.getConversation, messageId),
      setFlags: (messageId, flags) => invoke(IpcChannels.mail.setFlags, messageId, flags),
      moveMessage: (messageId, targetFolderId) =>
        invoke(IpcChannels.mail.moveMessage, messageId, targetFolderId),
      deleteMessage: (messageId) => invoke(IpcChannels.mail.deleteMessage, messageId),
      bulkAction: (input) => invoke(IpcChannels.mail.bulkAction, input),
      undoMoves: (moves) => invoke(IpcChannels.mail.undoMoves, moves),
      emptyFolder: (folderId) => invoke(IpcChannels.mail.emptyFolder, folderId),
      markFolderRead: (folderId) => invoke(IpcChannels.mail.markFolderRead, folderId),
      deleteSpam: (accountId) => invoke(IpcChannels.mail.deleteSpam, accountId),
      sendMessage: (input) => invoke(IpcChannels.mail.sendMessage, input),
      listOutbox: () => invoke(IpcChannels.mail.outboxList),
      retryOutbox: (id) => invoke(IpcChannels.mail.outboxRetry, id),
      discardOutbox: (id) => invoke(IpcChannels.mail.outboxDiscard, id),
      saveDraft: (accountId, draft, existingUid) =>
        invoke(IpcChannels.mail.saveDraft, accountId, draft, existingUid),
      deleteDraft: (accountId, uid) => invoke(IpcChannels.mail.deleteDraft, accountId, uid),
      downloadAttachment: (attachmentId) =>
        invoke(IpcChannels.mail.downloadAttachment, attachmentId),
      getAttachmentPath: (attachmentId) => invoke(IpcChannels.mail.attachmentPath, attachmentId),
      openAttachment: (attachmentId) => invoke(IpcChannels.mail.openAttachment, attachmentId),
      readAttachmentText: (attachmentId) =>
        invoke(IpcChannels.mail.readAttachmentText, attachmentId),
      search: (query, accountId) => invoke(IpcChannels.mail.search, query, accountId),
      searchServer: (accountId, query) => invoke(IpcChannels.mail.searchServer, accountId, query),
      listSnippets: () => invoke(IpcChannels.mail.listSnippets),
      addSnippet: (name, body) => invoke(IpcChannels.mail.addSnippet, name, body),
      deleteSnippet: (id) => invoke(IpcChannels.mail.deleteSnippet, id),
      snooze: (messageId, untilMs) => invoke(IpcChannels.mail.snooze, messageId, untilMs),
      unsnooze: (messageId) => invoke(IpcChannels.mail.unsnooze, messageId),
      scheduleSend: (payload, sendAt) => invoke(IpcChannels.mail.scheduleSend, payload, sendAt),
      listScheduled: () => invoke(IpcChannels.mail.listScheduled),
      cancelScheduled: (id) => invoke(IpcChannels.mail.cancelScheduled, id),
      setThreadMuted: (threadId, muted) => invoke(IpcChannels.mail.setThreadMuted, threadId, muted),
      setThreadPinned: (threadId, pinned) =>
        invoke(IpcChannels.mail.setThreadPinned, threadId, pinned),
      threadParticipants: (messageId) =>
        invoke(IpcChannels.mail.threadParticipants, messageId),
      listLabels: () => invoke(IpcChannels.mail.listLabels),
      createLabel: (name, color) => invoke(IpcChannels.mail.createLabel, name, color),
      deleteLabel: (id) => invoke(IpcChannels.mail.deleteLabel, id),
      addLabelToMessage: (messageId, labelId) =>
        invoke(IpcChannels.mail.addLabelToMessage, messageId, labelId),
      removeLabelFromMessage: (messageId, labelId) =>
        invoke(IpcChannels.mail.removeLabelFromMessage, messageId, labelId),
      listLabelMessages: (labelId) => invoke(IpcChannels.mail.listLabelMessages, labelId),
      labelsForMessage: (messageId) => invoke(IpcChannels.mail.labelsForMessage, messageId),
      listSavedSearches: () => invoke(IpcChannels.mail.listSavedSearches),
      createSavedSearch: (name, query) => invoke(IpcChannels.mail.createSavedSearch, name, query),
      deleteSavedSearch: (id) => invoke(IpcChannels.mail.deleteSavedSearch, id),
      importMbox: (path) => invoke(IpcChannels.mail.importMbox, path),
      pickImportMbox: () => invoke(IpcChannels.mail.pickImportMbox),
      onEvent: (cb) => on(IpcChannels.mail.events, cb)
    }
  }
}
