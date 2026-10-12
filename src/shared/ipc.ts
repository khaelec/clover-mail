import { z } from 'zod'
import type {
  AccountInput,
  AccountSummary,
  ComposeInput,
  ConnectionTestResult,
  CreateAccountInput,
  FolderSummary,
  MailEvent,
  MessageDetail,
  MessageSummary,
  SyncResult
} from './mail'

export const AppInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  electron: z.string(),
  chrome: z.string(),
  node: z.string(),
  platform: z.string(),
  userDataPath: z.string()
})
export type AppInfo = z.infer<typeof AppInfoSchema>

export const SettingsRecordSchema = z.record(z.string(), z.unknown())
export type SettingsRecord = z.infer<typeof SettingsRecordSchema>

export interface MailApi {
  listAccounts: () => Promise<AccountSummary[]>
  createAccount: (input: CreateAccountInput) => Promise<AccountSummary>
  updateAccount: (id: string, input: AccountInput) => Promise<AccountSummary>
  deleteAccount: (id: string) => Promise<void>
  testConnection: (input: CreateAccountInput) => Promise<ConnectionTestResult>
  syncAccount: (accountId: string) => Promise<SyncResult>
  syncFolder: (folderId: string) => Promise<SyncResult>
  listFolders: (accountId: string) => Promise<FolderSummary[]>
  listMessages: (folderId: string, limit?: number, offset?: number) => Promise<MessageSummary[]>
  listJunk: (accountId: string) => Promise<MessageSummary[]>
  spamCount: (accountId: string) => Promise<number>
  markSpam: (messageId: string) => Promise<void>
  markNotSpam: (messageId: string) => Promise<void>
  blockSender: (accountId: string, email: string) => Promise<void>
  allowSender: (accountId: string, email: string) => Promise<void>
  getMessage: (messageId: string) => Promise<MessageDetail | null>
  setFlags: (messageId: string, flags: { seen?: boolean; flagged?: boolean }) => Promise<void>
  moveMessage: (messageId: string, targetFolderId: string) => Promise<void>
  deleteMessage: (messageId: string) => Promise<void>
  sendMessage: (input: ComposeInput) => Promise<void>
  downloadAttachment: (attachmentId: string) => Promise<{ saved: boolean; path?: string }>
  search: (query: string, accountId?: string) => Promise<MessageSummary[]>
  onEvent: (cb: (event: MailEvent) => void) => () => void
}

export interface CloverApi {
  appInfo: () => Promise<AppInfo>
  getFilePath: (file: unknown) => string
  settings: {
    getAll: () => Promise<SettingsRecord>
    get: (key: string) => Promise<unknown>
    set: (key: string, value: unknown) => Promise<void>
    delete: (key: string) => Promise<void>
  }
  window: {
    minimize: () => void
    toggleMaximize: () => void
    close: () => void
    isMaximized: () => Promise<boolean>
    onMaximizedChanged: (cb: (maximized: boolean) => void) => () => void
  }
  mail: MailApi
}
