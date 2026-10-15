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
  isLocal: integer('is_local', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull()
})

export const accountAliases = sqliteTable(
  'account_aliases',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    name: text('name'),
    email: text('email').notNull(),
    createdAt: integer('created_at').notNull()
  },
  (table) => [index('ix_account_aliases_account').on(table.accountId)]
)

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
    sortOrder: integer('sort_order').notNull().default(0),
    isVisible: integer('is_visible', { mode: 'boolean' }).notNull().default(true),
    // Server-deletion reconciliation: the message count and uidNext seen at the
    // last sync (to skip the check when nothing changed), and a flag set when a
    // suspicious mass deletion needs confirming on the next sync.
    lastMessages: integer('last_messages'),
    lastUidNext: integer('last_uid_next'),
    reconcileSuspect: integer('reconcile_suspect', { mode: 'boolean' }).notNull().default(false)
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
    spamReasons: text('spam_reasons'),
    isImportant: integer('is_important', { mode: 'boolean' }).notNull().default(false),
    snoozedUntil: integer('snoozed_until'),
    pop3Uidl: text('pop3_uidl')
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

export const accountOauth = sqliteTable('account_oauth', {
  accountId: text('account_id').primaryKey(),
  provider: text('provider').notNull(),
  refreshTokenRef: text('refresh_token_ref').notNull(),
  scope: text('scope'),
  createdAt: integer('created_at').notNull()
})

export const snippets = sqliteTable('snippets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  body: text('body').notNull(),
  createdAt: integer('created_at').notNull()
})

export const scheduledSends = sqliteTable('scheduled_sends', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  payload: text('payload').notNull(),
  sendAt: integer('send_at').notNull(),
  createdAt: integer('created_at').notNull()
})

export const outbox = sqliteTable('outbox', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  payload: text('payload').notNull(),
  status: text('status').notNull().default('queued'),
  error: text('error'),
  attempts: integer('attempts').notNull().default(0),
  sendAt: integer('send_at').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
})

export const threadSettings = sqliteTable('thread_settings', {
  threadId: text('thread_id').primaryKey(),
  muted: integer('muted', { mode: 'boolean' }).notNull().default(false),
  pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false)
})

export const labels = sqliteTable('labels', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  createdAt: integer('created_at').notNull()
})

export const messageLabels = sqliteTable(
  'message_labels',
  {
    messageId: text('message_id').notNull(),
    labelId: text('label_id').notNull()
  },
  (table) => [index('ix_message_labels_label').on(table.labelId)]
)

export const savedSearches = sqliteTable('saved_searches', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  query: text('query').notNull(),
  createdAt: integer('created_at').notNull()
})

export const rules = sqliteTable(
  'rules',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    name: text('name').notNull(),
    isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(true),
    matchAll: integer('match_all', { mode: 'boolean' }).notNull().default(true),
    stopProcessing: integer('stop_processing', { mode: 'boolean' }).notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at').notNull()
  },
  (table) => [index('ix_rules_account').on(table.accountId)]
)

export const ruleConditions = sqliteTable(
  'rule_conditions',
  {
    id: text('id').primaryKey(),
    ruleId: text('rule_id')
      .notNull()
      .references(() => rules.id, { onDelete: 'cascade' }),
    field: text('field').notNull(),
    op: text('op').notNull(),
    value: text('value').notNull()
  },
  (table) => [index('ix_rule_conditions_rule').on(table.ruleId)]
)

export const ruleActions = sqliteTable(
  'rule_actions',
  {
    id: text('id').primaryKey(),
    ruleId: text('rule_id')
      .notNull()
      .references(() => rules.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    value: text('value')
  },
  (table) => [index('ix_rule_actions_rule').on(table.ruleId)]
)

export const customWebApps = sqliteTable('custom_web_apps', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  manifestUrl: text('manifest_url'),
  iconRef: text('icon_ref'),
  windowMode: text('window_mode').notNull().default('inline'),
  isPinned: integer('is_pinned', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at').notNull()
})

export const calendars = sqliteTable('calendars', {
  id: text('id').primaryKey(),
  accountId: text('account_id'),
  name: text('name').notNull(),
  color: text('color').notNull(),
  isVisible: integer('is_visible', { mode: 'boolean' }).notNull().default(true),
  kind: text('kind').notNull().default('local'),
  url: text('url'),
  username: text('username'),
  secretRef: text('secret_ref'),
  lastSyncAt: integer('last_sync_at'),
  createdAt: integer('created_at').notNull()
})

export const reminderLog = sqliteTable('reminder_log', {
  eventId: text('event_id').notNull(),
  occurrenceStart: integer('occurrence_start').notNull(),
  createdAt: integer('created_at').notNull()
})

export const calendarEvents = sqliteTable(
  'calendar_events',
  {
    id: text('id').primaryKey(),
    calendarId: text('calendar_id')
      .notNull()
      .references(() => calendars.id, { onDelete: 'cascade' }),
    uid: text('uid'),
    sequence: integer('sequence').notNull().default(0),
    summary: text('summary'),
    description: text('description'),
    location: text('location'),
    startUtc: integer('start_utc').notNull(),
    endUtc: integer('end_utc').notNull(),
    isAllDay: integer('is_all_day', { mode: 'boolean' }).notNull().default(false),
    tzid: text('tzid'),
    organizer: text('organizer'),
    status: text('status'),
    rrule: text('rrule'),
    exdate: text('exdate'),
    recurrenceId: text('recurrence_id'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (table) => [index('ix_calendar_events_calendar').on(table.calendarId, table.startUtc)]
)

export const calendarEventAttendees = sqliteTable(
  'calendar_event_attendees',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => calendarEvents.id, { onDelete: 'cascade' }),
    email: text('email'),
    name: text('name'),
    partstat: text('partstat')
  },
  (table) => [index('ix_calendar_attendees_event').on(table.eventId)]
)

export const schema = {
  appSettings,
  migrationsTable,
  accounts,
  accountAliases,
  accountOauth,
  snippets,
  scheduledSends,
  outbox,
  threadSettings,
  labels,
  messageLabels,
  savedSearches,
  incomingSettings,
  outgoingSettings,
  folders,
  messages,
  messageBodies,
  attachments,
  spamSenders,
  spamTokens,
  rules,
  ruleConditions,
  ruleActions,
  customWebApps,
  calendars,
  calendarEvents,
  calendarEventAttendees,
  reminderLog
}
