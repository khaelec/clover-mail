import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core'

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull()
})

export const migrationsTable = sqliteTable('__migrations', {
  id: text('id').primaryKey(),
  appliedAt: integer('applied_at').notNull()
})

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  color: text('color'),
  isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull()
})

export const incomingSettings = sqliteTable('incoming_settings', {
  id: text('id').primaryKey(),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  protocol: text('protocol').notNull().default('imap'),
  host: text('host').notNull(),
  port: integer('port').notNull(),
  security: text('security').notNull(),
  username: text('username').notNull(),
  secretRef: text('secret_ref').notNull()
})

export const outgoingSettings = sqliteTable('outgoing_settings', {
  id: text('id').primaryKey(),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  host: text('host').notNull(),
  port: integer('port').notNull(),
  security: text('security').notNull(),
  username: text('username').notNull(),
  secretRef: text('secret_ref').notNull()
})

export const folders = sqliteTable(
  'folders',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    remotePath: text('remote_path').notNull(),
    name: text('name').notNull(),
    specialUse: text('special_use'),
    delimiter: text('delimiter'),
    uidValidity: integer('uid_validity'),
    uidNext: integer('uid_next'),
    unreadCount: integer('unread_count').notNull().default(0),
    totalCount: integer('total_count').notNull().default(0),
    isSubscribed: integer('is_subscribed', { mode: 'boolean' }).notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0)
  },
  (table) => [uniqueIndex('ux_folders_account_path').on(table.accountId, table.remotePath)]
)

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    folderId: text('folder_id').notNull(),
    uid: integer('uid').notNull(),
    messageId: text('message_id'),
    inReplyTo: text('in_reply_to'),
    refs: text('refs'),
    subject: text('subject'),
    fromName: text('from_name'),
    fromEmail: text('from_email'),
    toJson: text('to_json'),
    ccJson: text('cc_json'),
    bccJson: text('bcc_json'),
    replyToJson: text('reply_to_json'),
    dateUtc: integer('date_utc'),
    internalDate: integer('internal_date'),
    size: integer('size'),
    isRead: integer('is_read', { mode: 'boolean' }).notNull().default(false),
    isFlagged: integer('is_flagged', { mode: 'boolean' }).notNull().default(false),
    isAnswered: integer('is_answered', { mode: 'boolean' }).notNull().default(false),
    isDraft: integer('is_draft', { mode: 'boolean' }).notNull().default(false),
    hasAttachments: integer('has_attachments', { mode: 'boolean' }).notNull().default(false),
    snippet: text('snippet'),
    threadId: text('thread_id'),
    isSpam: integer('is_spam', { mode: 'boolean' }).notNull().default(false),
    spamScore: integer('spam_score').notNull().default(0),
    spamReasons: text('spam_reasons')
  },
  (table) => [
    uniqueIndex('ux_messages_account_folder_uid').on(table.accountId, table.folderId, table.uid),
    index('ix_messages_folder_date').on(table.accountId, table.folderId, table.dateUtc)
  ]
)

export const messageBodies = sqliteTable('message_bodies', {
  messageId: text('message_id')
    .primaryKey()
    .references(() => messages.id, { onDelete: 'cascade' }),
  textPlain: text('text_plain'),
  htmlRaw: text('html_raw'),
  fetchedAt: integer('fetched_at').notNull()
})

export const attachments = sqliteTable(
  'attachments',
  {
    id: text('id').primaryKey(),
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    filename: text('filename'),
    mimeType: text('mime_type'),
    size: integer('size'),
    contentId: text('content_id'),
    isInline: integer('is_inline', { mode: 'boolean' }).notNull().default(false),
    contentPath: text('content_path')
  },
  (table) => [index('ix_attachments_message').on(table.messageId)]
)

export const spamSenders = sqliteTable(
  'spam_senders',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    email: text('email').notNull(),
    kind: text('kind').notNull(),
    createdAt: integer('created_at').notNull()
  },
  (table) => [uniqueIndex('ux_spam_senders_account_email').on(table.accountId, table.email)]
)

export const spamTokens = sqliteTable('spam_tokens', {
  token: text('token').primaryKey(),
  spamCount: integer('spam_count').notNull().default(0),
  hamCount: integer('ham_count').notNull().default(0)
})

export const schema = {
  appSettings,
  migrationsTable,
  accounts,
  incomingSettings,
  outgoingSettings,
  folders,
  messages,
  messageBodies,
  attachments,
  spamSenders,
  spamTokens
}
