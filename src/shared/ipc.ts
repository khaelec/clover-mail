import { z } from 'zod'
import type {
  AccountInput,
  AccountSummary,
  ApplyRulesResult,
  BulkActionInput,
  BulkActionResult,
  ComposeInput,
  ConnectionTestResult,
  CreateAccountInput,
  CreateFolderInput,
  FolderSummary,
  MailEvent,
  MessageDetail,
  MessageSummary,
  Rule,
  RuleInput,
  SyncResult
} from './mail'
import type { CreateAppInput, CustomApp } from './apps'
import type {
  Calendar,
  CalendarEvent,
  EventInput,
  ImportResult,
  Occurrence
} from './calendar'
import type { AiChatRequest, AiSettings, AiStatus, AiStreamEvent, McpSettings } from './ai'

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
  listThreads: (folderId: string, limit?: number) => Promise<import('./mail').ThreadSummary[]>
  listJunk: (accountId: string) => Promise<MessageSummary[]>
  spamCount: (accountId: string) => Promise<number>
  listImportant: (accountId: string) => Promise<MessageSummary[]>
  importantCount: (accountId: string) => Promise<number>
  markSpam: (messageId: string) => Promise<void>
  markNotSpam: (messageId: string) => Promise<void>
  blockSender: (accountId: string, email: string) => Promise<void>
  allowSender: (accountId: string, email: string) => Promise<void>
  createFolder: (input: CreateFolderInput) => Promise<void>
  listRules: (accountId: string) => Promise<Rule[]>
  createRule: (accountId: string, input: RuleInput) => Promise<Rule>
  updateRule: (ruleId: string, input: RuleInput) => Promise<Rule>
  deleteRule: (ruleId: string) => Promise<void>
  applyRules: (accountId: string) => Promise<ApplyRulesResult>
  getMessage: (messageId: string) => Promise<MessageDetail | null>
  setFlags: (messageId: string, flags: { seen?: boolean; flagged?: boolean; important?: boolean }) => Promise<void>
  moveMessage: (messageId: string, targetFolderId: string) => Promise<void>
  deleteMessage: (messageId: string) => Promise<void>
  bulkAction: (input: BulkActionInput) => Promise<BulkActionResult>
  sendMessage: (input: ComposeInput) => Promise<void>
  downloadAttachment: (attachmentId: string) => Promise<{ saved: boolean; path?: string }>
  search: (query: string, accountId?: string) => Promise<MessageSummary[]>
  onEvent: (cb: (event: MailEvent) => void) => () => void
}

export interface AppsApi {
  list: () => Promise<CustomApp[]>
  create: (input: CreateAppInput) => Promise<CustomApp>
  remove: (id: string) => Promise<void>
  update: (id: string, patch: Partial<CustomApp>) => Promise<void>
}

export interface CalendarApi {
  listCalendars: () => Promise<Calendar[]>
  createCalendar: (name: string, color?: string) => Promise<Calendar>
  listOccurrences: (startUtc: number, endUtc: number) => Promise<Occurrence[]>
  getEvent: (id: string) => Promise<CalendarEvent | null>
  createEvent: (input: EventInput) => Promise<CalendarEvent>
  updateEvent: (id: string, input: EventInput) => Promise<CalendarEvent>
  deleteEvent: (id: string) => Promise<void>
  importPath: (path: string) => Promise<ImportResult>
  importAttachment: (attachmentId: string) => Promise<ImportResult>
  pickAndImport: () => Promise<ImportResult | null>
  exportIcs: (calendarId?: string) => Promise<{ saved: boolean; path?: string }>
}

export interface AiApi {
  getSettings: () => Promise<AiSettings>
  setSettings: (patch: Partial<AiSettings> & { claudeApiKey?: string }) => Promise<AiSettings>
  status: () => Promise<AiStatus>
  listModels: (provider: string) => Promise<string[]>
  chat: (request: AiChatRequest) => Promise<void>
  cancel: (streamId: string) => Promise<void>
  onStream: (cb: (event: AiStreamEvent) => void) => () => void
  getMcpSettings: () => Promise<McpSettings>
  setMcpSettings: (patch: Partial<McpSettings>) => Promise<McpSettings>
  mcpStart: () => Promise<{ running: boolean; port: number }>
  mcpStop: () => Promise<void>
}

export interface WallpaperApi {
  pickFile: (kind: string) => Promise<string | null>
  pickFolder: () => Promise<string | null>
  listFolder: (path: string) => Promise<string[]>
  detectEngine: () => Promise<import('./wallpaper').WeDetection>
}

export interface CloverApi {
  appInfo: () => Promise<AppInfo>
  getFilePath: (file: unknown) => string
  apps: AppsApi
  calendar: CalendarApi
  ai: AiApi
  wallpaper: WallpaperApi
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
