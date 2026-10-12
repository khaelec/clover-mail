export type Security = 'ssl' | 'starttls' | 'none'
export type IncomingProtocol = 'imap' | 'pop3'

/** Synthetic (local) folder id for spam-classified messages. */
export const JUNK_FOLDER_ID = 'junk'

export interface EndpointInput {
  host: string
  port: number
  security: Security
  username: string
}

export interface AccountInput {
  email: string
  displayName?: string
  incoming: EndpointInput
  outgoing: EndpointInput
}

export interface CreateAccountInput extends AccountInput {
  password: string
}

export interface AccountSummary {
  id: string
  email: string
  displayName: string | null
  color: string | null
  isEnabled: boolean
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
}

export interface AttachmentRef {
  filename: string
  path: string
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
  inReplyTo?: string
  references?: string
}

export interface SyncResult {
  folders: number
  fetched: number
}

export type MailEventType = 'sync:start' | 'sync:folder' | 'sync:progress' | 'sync:done' | 'sync:error'

export interface MailEvent {
  type: MailEventType
  accountId: string
  folderId?: string
  folderName?: string
  fetched?: number
  error?: string
}
