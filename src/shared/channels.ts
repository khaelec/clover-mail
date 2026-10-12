export const IpcChannels = {
  appInfo: 'app:info',
  settingsGetAll: 'settings:getAll',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  settingsDelete: 'settings:delete',
  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',
  windowIsMaximized: 'window:is-maximized',
  windowMaximizedChanged: 'window:maximized-changed',
  mail: {
    listAccounts: 'mail:list-accounts',
    createAccount: 'mail:create-account',
    updateAccount: 'mail:update-account',
    deleteAccount: 'mail:delete-account',
    testConnection: 'mail:test-connection',
    syncAccount: 'mail:sync-account',
    syncFolder: 'mail:sync-folder',
    listFolders: 'mail:list-folders',
    listMessages: 'mail:list-messages',
    listJunk: 'mail:list-junk',
    spamCount: 'mail:spam-count',
    markSpam: 'mail:mark-spam',
    markNotSpam: 'mail:mark-not-spam',
    blockSender: 'mail:block-sender',
    allowSender: 'mail:allow-sender',
    getMessage: 'mail:get-message',
    setFlags: 'mail:set-flags',
    moveMessage: 'mail:move-message',
    deleteMessage: 'mail:delete-message',
    sendMessage: 'mail:send-message',
    downloadAttachment: 'mail:download-attachment',
    search: 'mail:search',
    events: 'mail:events'
  }
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]
