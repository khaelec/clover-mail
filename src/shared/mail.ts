export type Security = 'ssl' | 'starttls' | 'none'
export type IncomingProtocol = 'imap' | 'pop3'
export type AccountAuthType = 'password' | 'oauth'
export type OAuthProvider = 'google' | 'microsoft'

/** Synthetic (local) folder id for spam-classified messages. */
export const JUNK_FOLDER_ID = 'junk'
/** Synthetic (local) folder id for user-marked important messages. */
export const IMPORTANT_FOLDER_ID = 'important'
/** Synthetic (local) folder id for the cross-account unified inbox. */
export const UNIFIED_FOLDER_ID = 'unified'

export interface EndpointInput {
  host: string
  port: number
  security: Security
  username: string
  protocol?: IncomingProtocol | 'local'
}

export interface AccountInput {
  email: string
  displayName?: string
  incoming: EndpointInput
  outgoing: EndpointInput
}

export interface CreateAccountInput extends AccountInput {
  password: string
  protocol?: IncomingProtocol
}

export interface AccountSummary {
  id: string
  email: string
  displayName: string | null
  color: string | null
  isEnabled: boolean
  authType: AccountAuthType
  incoming: EndpointInput
  outgoing: EndpointInput
}

export interface ConnectionTestResult {
  ok: boolean
  imap?: string
  smtp?: string
  error?: string
}

export interface FolderSummary {
  id: string
  accountId: string
  remotePath: string
  name: string
  specialUse: string | null
  unreadCount: number
  totalCount: number
  sortOrder: number
  isVisible: boolean
}

export interface AccountAlias {
  id: string
  accountId: string
  name: string | null
  email: string
}

export interface MessageSummary {
  id: string
  accountId: string
  folderId: string
  uid: number
  subject: string | null
  fromName: string | null
  fromEmail: string | null
  dateUtc: number | null
  snippet: string | null
  isRead: boolean
  isFlagged: boolean
  hasAttachments: boolean
  spamScore: number
  isSpam: boolean
  isImportant: boolean
  threadId: string | null
}

export interface AttachmentSummary {
  id: string
  filename: string | null
  mimeType: string | null
  size: number | null
  isInline: boolean
  available: boolean
}

export interface InlineImage {
  contentId: string
  dataUrl: string
}

export type MessageSigning = 'none' | 'pgp-inline' | 'pgp-mime' | 'smime'
export type MessageEncryption = 'none' | 'pgp-inline' | 'pgp-mime' | 'smime'

export interface MessageSecurity {
  signing: MessageSigning
  encryption: MessageEncryption
  signed: boolean
  encrypted: boolean
  verified: boolean
}

export interface MessagePhishing {
  suspicious: boolean
  reasons: string[]
}

export interface MessageDetail extends MessageSummary {
  messageId: string | null
  inReplyTo: string | null
  refs: string | null
  to: string[]
  cc: string[]
  bcc: string[]
  textPlain: string | null
  htmlRaw: string | null
  attachments: AttachmentSummary[]
  inlineImages: InlineImage[]
  spamReasons: string[]
  security: MessageSecurity
  phishing: MessagePhishing
}

export interface AttachmentRef {
  filename: string
  path: string
}

export interface DraftData {
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  text?: string
  html?: string
  fromEmail?: string
  fromName?: string
}

export interface Snippet {
  id: string
  name: string
  body: string
}

export interface ScheduledSend {
  id: string
  accountId: string
  subject: string
  sendAt: number
}

export interface Label {
  id: string
  name: string
  color: string
}

export interface SavedSearch {
  id: string
  name: string
  query: string
}

export interface ComposeInput {
  accountId: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  text?: string
  html?: string
  attachments?: AttachmentRef[]
  fromEmail?: string
  fromName?: string
  inReplyTo?: string
  references?: string
}

export interface SyncResult {
  folders: number
  fetched: number
}

export type MailEventType =
  | 'sync:start'
  | 'sync:folder'
  | 'sync:progress'
  | 'sync:done'
  | 'sync:error'
  | 'mail:new'
  | 'mail:refresh'

export interface MailEvent {
  type: MailEventType
  accountId: string
  folderId?: string
  folderName?: string
  fetched?: number
  error?: string
  title?: string
  body?: string
}

export interface CreateFolderInput {
  accountId: string
  name: string
  parentRemotePath?: string
}

export type RuleField = 'from' | 'to' | 'subject' | 'body' | 'hasAttachment'
export type RuleOp = 'contains' | 'equals' | 'startsWith' | 'endsWith'
export type RuleActionType = 'move' | 'markRead' | 'markFlagged' | 'markSpam' | 'trash'

export interface RuleConditionInput {
  field: RuleField
  op: RuleOp
  value: string
}

export interface RuleActionInput {
  action: RuleActionType
  value?: string
}

export interface Rule {
  id: string
  accountId: string
  name: string
  isEnabled: boolean
  matchAll: boolean
  stopProcessing: boolean
  sortOrder: number
  conditions: RuleConditionInput[]
  actions: RuleActionInput[]
}

export interface RuleInput {
  name: string
  isEnabled: boolean
  matchAll: boolean
  stopProcessing: boolean
  conditions: RuleConditionInput[]
  actions: RuleActionInput[]
}

export interface ApplyRulesResult {
  matched: number
  moved: number
}

export type BulkActionType = 'archive' | 'trash' | 'markRead' | 'markUnread' | 'markImportant' | 'markNotImportant' | 'move'

export interface BulkActionInput {
  messageIds: string[]
  action: BulkActionType
  targetFolderId?: string
}

export interface BulkActionResult {
  moved: number
  updated: number
  failed: number
}

export interface ThreadSummary {
  threadId: string
  subject: string | null
  fromName: string | null
  fromEmail: string | null
  messageCount: number
  unreadCount: number
  hasAttachments: boolean
  isImportant: boolean
  muted: boolean
  pinned: boolean
  lastDate: number | null
  messages: MessageSummary[]
}
