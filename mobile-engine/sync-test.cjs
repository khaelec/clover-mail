"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc4) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key2 of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key2) && key2 !== except)
        __defProp(to, key2, { get: () => from[key2], enumerable: !(desc4 = __getOwnPropDesc(from, key2)) || desc4.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/mobile/engine/bridge-stub.cjs
var require_bridge_stub = __commonJS({
  "src/mobile/engine/bridge-stub.cjs"(exports2, module2) {
    "use strict";
    var os = require("node:os");
    var path = require("node:path");
    var readline = require("node:readline");
    var listeners = /* @__PURE__ */ new Map();
    var app = {
      datadir: () => process.env.CLOVER_DATA_DIR || path.join(os.tmpdir(), "clover-engine-test")
    };
    var channel = {
      on(name, cb) {
        listeners.set(name, cb);
      },
      post(name, ...args) {
        process.stdout.write(`${JSON.stringify({ post: name, args })}
`);
      }
    };
    module2.exports = { app, channel };
    var rl = readline.createInterface({ input: process.stdin });
    rl.on("line", (line) => {
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if (msg && msg.send) {
        const cb = listeners.get(msg.send);
        if (cb) cb(...msg.args ?? []);
      }
    });
  }
});

// src/core/db/migrations.ts
var migrations;
var init_migrations = __esm({
  "src/core/db/migrations.ts"() {
    "use strict";
    migrations = [
      {
        id: "0000_init",
        sql: `
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `
      },
      {
        id: "0001_mail",
        sql: `
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY NOT NULL,
        email TEXT NOT NULL,
        display_name TEXT,
        color TEXT,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS incoming_settings (
        id TEXT PRIMARY KEY NOT NULL,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        protocol TEXT NOT NULL DEFAULT 'imap',
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        security TEXT NOT NULL,
        username TEXT NOT NULL,
        secret_ref TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS outgoing_settings (
        id TEXT PRIMARY KEY NOT NULL,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        security TEXT NOT NULL,
        username TEXT NOT NULL,
        secret_ref TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY NOT NULL,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        remote_path TEXT NOT NULL,
        name TEXT NOT NULL,
        special_use TEXT,
        delimiter TEXT,
        uid_validity INTEGER,
        uid_next INTEGER,
        unread_count INTEGER NOT NULL DEFAULT 0,
        total_count INTEGER NOT NULL DEFAULT 0,
        is_subscribed INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
      CREATE UNIQUE INDEX IF NOT EXISTS ux_folders_account_path
        ON folders(account_id, remote_path);

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY NOT NULL,
        account_id TEXT NOT NULL,
        folder_id TEXT NOT NULL,
        uid INTEGER NOT NULL,
        message_id TEXT,
        in_reply_to TEXT,
        refs TEXT,
        subject TEXT,
        from_name TEXT,
        from_email TEXT,
        to_json TEXT,
        cc_json TEXT,
        bcc_json TEXT,
        reply_to_json TEXT,
        date_utc INTEGER,
        internal_date INTEGER,
        size INTEGER,
        is_read INTEGER NOT NULL DEFAULT 0,
        is_flagged INTEGER NOT NULL DEFAULT 0,
        is_answered INTEGER NOT NULL DEFAULT 0,
        is_draft INTEGER NOT NULL DEFAULT 0,
        has_attachments INTEGER NOT NULL DEFAULT 0,
        snippet TEXT,
        thread_id TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS ux_messages_account_folder_uid
        ON messages(account_id, folder_id, uid);
      CREATE INDEX IF NOT EXISTS ix_messages_folder_date
        ON messages(account_id, folder_id, date_utc);

      CREATE TABLE IF NOT EXISTS message_bodies (
        message_id TEXT PRIMARY KEY NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        text_plain TEXT,
        html_raw TEXT,
        fetched_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY NOT NULL,
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        filename TEXT,
        mime_type TEXT,
        size INTEGER,
        content_id TEXT,
        is_inline INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS ix_attachments_message ON attachments(message_id);

      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        message_id UNINDEXED,
        subject,
        from_name,
        from_email,
        snippet,
        body,
        tokenize = 'unicode61'
      );
    `
      },
      {
        id: "0002_message_richness",
        sql: `
      ALTER TABLE attachments ADD COLUMN content_path TEXT;
    `
      },
      {
        id: "0003_spam",
        sql: `
      ALTER TABLE messages ADD COLUMN is_spam INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE messages ADD COLUMN spam_score INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE messages ADD COLUMN spam_reasons TEXT;

      CREATE TABLE IF NOT EXISTS spam_senders (
        id TEXT PRIMARY KEY NOT NULL,
        account_id TEXT NOT NULL,
        email TEXT NOT NULL,
        kind TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS ux_spam_senders_account_email
        ON spam_senders(account_id, email);

      CREATE TABLE IF NOT EXISTS spam_tokens (
        token TEXT PRIMARY KEY NOT NULL,
        spam_count INTEGER NOT NULL DEFAULT 0,
        ham_count INTEGER NOT NULL DEFAULT 0
      );
    `
      },
      {
        id: "0004_rules",
        sql: `
      CREATE TABLE IF NOT EXISTS rules (
        id TEXT PRIMARY KEY NOT NULL,
        account_id TEXT NOT NULL,
        name TEXT NOT NULL,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        match_all INTEGER NOT NULL DEFAULT 1,
        stop_processing INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ix_rules_account ON rules(account_id);

      CREATE TABLE IF NOT EXISTS rule_conditions (
        id TEXT PRIMARY KEY NOT NULL,
        rule_id TEXT NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
        field TEXT NOT NULL,
        op TEXT NOT NULL,
        value TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ix_rule_conditions_rule ON rule_conditions(rule_id);

      CREATE TABLE IF NOT EXISTS rule_actions (
        id TEXT PRIMARY KEY NOT NULL,
        rule_id TEXT NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        value TEXT
      );
      CREATE INDEX IF NOT EXISTS ix_rule_actions_rule ON rule_actions(rule_id);
    `
      },
      {
        id: "0005_custom_apps",
        sql: `
      CREATE TABLE IF NOT EXISTS custom_web_apps (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        manifest_url TEXT,
        icon_ref TEXT,
        window_mode TEXT NOT NULL DEFAULT 'inline',
        is_pinned INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
    `
      },
      {
        id: "0006_calendar",
        sql: `
      CREATE TABLE IF NOT EXISTS calendars (
        id TEXT PRIMARY KEY NOT NULL,
        account_id TEXT,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        is_visible INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS calendar_events (
        id TEXT PRIMARY KEY NOT NULL,
        calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
        uid TEXT,
        sequence INTEGER NOT NULL DEFAULT 0,
        summary TEXT,
        description TEXT,
        location TEXT,
        start_utc INTEGER NOT NULL,
        end_utc INTEGER NOT NULL,
        is_all_day INTEGER NOT NULL DEFAULT 0,
        tzid TEXT,
        organizer TEXT,
        status TEXT,
        rrule TEXT,
        exdate TEXT,
        recurrence_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ix_calendar_events_calendar ON calendar_events(calendar_id, start_utc);

      CREATE TABLE IF NOT EXISTS calendar_event_attendees (
        id TEXT PRIMARY KEY NOT NULL,
        event_id TEXT NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
        email TEXT,
        name TEXT,
        partstat TEXT
      );
      CREATE INDEX IF NOT EXISTS ix_calendar_attendees_event ON calendar_event_attendees(event_id);
    `
      },
      {
        id: "0007_important",
        sql: `
      ALTER TABLE messages ADD COLUMN is_important INTEGER NOT NULL DEFAULT 0;
    `
      },
      {
        id: "0008_aliases_and_folder_visibility",
        sql: `
      CREATE TABLE IF NOT EXISTS account_aliases (
        id TEXT PRIMARY KEY NOT NULL,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        name TEXT,
        email TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      ALTER TABLE folders ADD COLUMN is_visible INTEGER NOT NULL DEFAULT 1;
    `
      },
      {
        id: "0009_oauth_accounts",
        sql: `
      CREATE TABLE IF NOT EXISTS account_oauth (
        account_id TEXT PRIMARY KEY NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        refresh_token_ref TEXT NOT NULL,
        scope TEXT,
        created_at INTEGER NOT NULL
      );
    `
      },
      {
        id: "0010_snippets_and_snooze",
        sql: `
      CREATE TABLE IF NOT EXISTS snippets (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      ALTER TABLE messages ADD COLUMN snoozed_until INTEGER;
    `
      },
      {
        id: "0011_schedules_and_threads",
        sql: `
      CREATE TABLE IF NOT EXISTS scheduled_sends (
        id TEXT PRIMARY KEY NOT NULL,
        account_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        send_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS thread_settings (
        thread_id TEXT PRIMARY KEY NOT NULL,
        muted INTEGER NOT NULL DEFAULT 0,
        pinned INTEGER NOT NULL DEFAULT 0
      );
    `
      },
      {
        id: "0012_labels",
        sql: `
      CREATE TABLE IF NOT EXISTS labels (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS message_labels (
        message_id TEXT NOT NULL,
        label_id TEXT NOT NULL,
        PRIMARY KEY (message_id, label_id)
      );
    `
      },
      {
        id: "0013_saved_searches",
        sql: `
      CREATE TABLE IF NOT EXISTS saved_searches (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        query TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `
      },
      {
        id: "0014_calendar_sync_and_reminders",
        sql: `
      ALTER TABLE calendars ADD COLUMN kind TEXT NOT NULL DEFAULT 'local';
      ALTER TABLE calendars ADD COLUMN url TEXT;
      ALTER TABLE calendars ADD COLUMN username TEXT;
      ALTER TABLE calendars ADD COLUMN secret_ref TEXT;
      ALTER TABLE calendars ADD COLUMN last_sync_at INTEGER;
      CREATE TABLE IF NOT EXISTS reminder_log (
        event_id TEXT NOT NULL,
        occurrence_start INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (event_id, occurrence_start)
      );
    `
      },
      {
        id: "0015_pop3_and_local_accounts",
        sql: `
      ALTER TABLE accounts ADD COLUMN is_local INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE messages ADD COLUMN pop3_uidl TEXT;
    `
      },
      {
        id: "0016_message_id_index",
        sql: `
      CREATE INDEX IF NOT EXISTS ix_messages_account_message ON messages(account_id, message_id);
    `
      },
      {
        id: "0017_outbox",
        sql: `
      CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY NOT NULL,
        account_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        error TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        send_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ix_outbox_status_send ON outbox(status, send_at);
    `
      },
      {
        // Server-deletion reconciliation. Adds columns only; existing rows keep their
        // data (the new columns default to NULL/0).
        id: "0018_folder_reconcile",
        sql: `
      ALTER TABLE folders ADD COLUMN last_messages INTEGER;
      ALTER TABLE folders ADD COLUMN last_uid_next INTEGER;
      ALTER TABLE folders ADD COLUMN reconcile_suspect INTEGER NOT NULL DEFAULT 0;
    `
      },
      {
        // Per-app "run in background" (on by default). Adds a column only.
        id: "0019_app_background",
        sql: `
      ALTER TABLE custom_web_apps ADD COLUMN run_in_background INTEGER NOT NULL DEFAULT 1;
    `
      },
      {
        // Per-app notification settings. Adds columns only.
        id: "0020_app_notify_settings",
        sql: `
      ALTER TABLE custom_web_apps ADD COLUMN notify_in_bell INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE custom_web_apps ADD COLUMN notify_os_popup INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE custom_web_apps ADD COLUMN notify_hide_preview INTEGER NOT NULL DEFAULT 0;
    `
      },
      {
        // Persist the notification bell across restarts.
        id: "0021_notifications",
        sql: `
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY NOT NULL,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        at INTEGER NOT NULL,
        read INTEGER NOT NULL DEFAULT 0,
        account_id TEXT,
        message_id TEXT,
        thread_id TEXT,
        app_id TEXT,
        app_name TEXT,
        app_notif_id TEXT,
        count INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS ix_notifications_at ON notifications(at);
    `
      },
      {
        // Where a bell item opens (e.g. reminders -> calendar). Adds a column only.
        id: "0022_notification_nav",
        sql: `
      ALTER TABLE notifications ADD COLUMN nav TEXT;
    `
      }
    ];
  }
});

// src/core/db/schema.ts
var schema_exports = {};
__export(schema_exports, {
  accountAliases: () => accountAliases,
  accountOauth: () => accountOauth,
  accounts: () => accounts,
  appSettings: () => appSettings,
  attachments: () => attachments,
  calendarEventAttendees: () => calendarEventAttendees,
  calendarEvents: () => calendarEvents,
  calendars: () => calendars,
  customWebApps: () => customWebApps,
  folders: () => folders,
  incomingSettings: () => incomingSettings,
  labels: () => labels,
  messageBodies: () => messageBodies,
  messageLabels: () => messageLabels,
  messages: () => messages,
  migrationsTable: () => migrationsTable,
  notifications: () => notifications,
  outbox: () => outbox,
  outgoingSettings: () => outgoingSettings,
  reminderLog: () => reminderLog,
  ruleActions: () => ruleActions,
  ruleConditions: () => ruleConditions,
  rules: () => rules,
  savedSearches: () => savedSearches,
  scheduledSends: () => scheduledSends,
  schema: () => schema,
  snippets: () => snippets,
  spamSenders: () => spamSenders,
  spamTokens: () => spamTokens,
  threadSettings: () => threadSettings
});
var import_sqlite_core, appSettings, migrationsTable, accounts, accountAliases, incomingSettings, outgoingSettings, folders, messages, messageBodies, attachments, notifications, spamSenders, spamTokens, accountOauth, snippets, scheduledSends, outbox, threadSettings, labels, messageLabels, savedSearches, rules, ruleConditions, ruleActions, customWebApps, calendars, reminderLog, calendarEvents, calendarEventAttendees, schema;
var init_schema = __esm({
  "src/core/db/schema.ts"() {
    "use strict";
    import_sqlite_core = require("drizzle-orm/sqlite-core");
    appSettings = (0, import_sqlite_core.sqliteTable)("app_settings", {
      key: (0, import_sqlite_core.text)("key").primaryKey(),
      value: (0, import_sqlite_core.text)("value").notNull(),
      updatedAt: (0, import_sqlite_core.integer)("updated_at").notNull()
    });
    migrationsTable = (0, import_sqlite_core.sqliteTable)("__migrations", {
      id: (0, import_sqlite_core.text)("id").primaryKey(),
      appliedAt: (0, import_sqlite_core.integer)("applied_at").notNull()
    });
    accounts = (0, import_sqlite_core.sqliteTable)("accounts", {
      id: (0, import_sqlite_core.text)("id").primaryKey(),
      email: (0, import_sqlite_core.text)("email").notNull(),
      displayName: (0, import_sqlite_core.text)("display_name"),
      color: (0, import_sqlite_core.text)("color"),
      isEnabled: (0, import_sqlite_core.integer)("is_enabled", { mode: "boolean" }).notNull().default(true),
      isLocal: (0, import_sqlite_core.integer)("is_local", { mode: "boolean" }).notNull().default(false),
      createdAt: (0, import_sqlite_core.integer)("created_at").notNull()
    });
    accountAliases = (0, import_sqlite_core.sqliteTable)(
      "account_aliases",
      {
        id: (0, import_sqlite_core.text)("id").primaryKey(),
        accountId: (0, import_sqlite_core.text)("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
        name: (0, import_sqlite_core.text)("name"),
        email: (0, import_sqlite_core.text)("email").notNull(),
        createdAt: (0, import_sqlite_core.integer)("created_at").notNull()
      },
      (table) => [(0, import_sqlite_core.index)("ix_account_aliases_account").on(table.accountId)]
    );
    incomingSettings = (0, import_sqlite_core.sqliteTable)("incoming_settings", {
      id: (0, import_sqlite_core.text)("id").primaryKey(),
      accountId: (0, import_sqlite_core.text)("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
      protocol: (0, import_sqlite_core.text)("protocol").notNull().default("imap"),
      host: (0, import_sqlite_core.text)("host").notNull(),
      port: (0, import_sqlite_core.integer)("port").notNull(),
      security: (0, import_sqlite_core.text)("security").notNull(),
      username: (0, import_sqlite_core.text)("username").notNull(),
      secretRef: (0, import_sqlite_core.text)("secret_ref").notNull()
    });
    outgoingSettings = (0, import_sqlite_core.sqliteTable)("outgoing_settings", {
      id: (0, import_sqlite_core.text)("id").primaryKey(),
      accountId: (0, import_sqlite_core.text)("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
      host: (0, import_sqlite_core.text)("host").notNull(),
      port: (0, import_sqlite_core.integer)("port").notNull(),
      security: (0, import_sqlite_core.text)("security").notNull(),
      username: (0, import_sqlite_core.text)("username").notNull(),
      secretRef: (0, import_sqlite_core.text)("secret_ref").notNull()
    });
    folders = (0, import_sqlite_core.sqliteTable)(
      "folders",
      {
        id: (0, import_sqlite_core.text)("id").primaryKey(),
        accountId: (0, import_sqlite_core.text)("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
        remotePath: (0, import_sqlite_core.text)("remote_path").notNull(),
        name: (0, import_sqlite_core.text)("name").notNull(),
        specialUse: (0, import_sqlite_core.text)("special_use"),
        delimiter: (0, import_sqlite_core.text)("delimiter"),
        uidValidity: (0, import_sqlite_core.integer)("uid_validity"),
        uidNext: (0, import_sqlite_core.integer)("uid_next"),
        unreadCount: (0, import_sqlite_core.integer)("unread_count").notNull().default(0),
        totalCount: (0, import_sqlite_core.integer)("total_count").notNull().default(0),
        isSubscribed: (0, import_sqlite_core.integer)("is_subscribed", { mode: "boolean" }).notNull().default(true),
        sortOrder: (0, import_sqlite_core.integer)("sort_order").notNull().default(0),
        isVisible: (0, import_sqlite_core.integer)("is_visible", { mode: "boolean" }).notNull().default(true),
        // Server-deletion reconciliation: the message count and uidNext seen at the
        // last sync (to skip the check when nothing changed), and a flag set when a
        // suspicious mass deletion needs confirming on the next sync.
        lastMessages: (0, import_sqlite_core.integer)("last_messages"),
        lastUidNext: (0, import_sqlite_core.integer)("last_uid_next"),
        reconcileSuspect: (0, import_sqlite_core.integer)("reconcile_suspect", { mode: "boolean" }).notNull().default(false)
      },
      (table) => [(0, import_sqlite_core.uniqueIndex)("ux_folders_account_path").on(table.accountId, table.remotePath)]
    );
    messages = (0, import_sqlite_core.sqliteTable)(
      "messages",
      {
        id: (0, import_sqlite_core.text)("id").primaryKey(),
        accountId: (0, import_sqlite_core.text)("account_id").notNull(),
        folderId: (0, import_sqlite_core.text)("folder_id").notNull(),
        uid: (0, import_sqlite_core.integer)("uid").notNull(),
        messageId: (0, import_sqlite_core.text)("message_id"),
        inReplyTo: (0, import_sqlite_core.text)("in_reply_to"),
        refs: (0, import_sqlite_core.text)("refs"),
        subject: (0, import_sqlite_core.text)("subject"),
        fromName: (0, import_sqlite_core.text)("from_name"),
        fromEmail: (0, import_sqlite_core.text)("from_email"),
        toJson: (0, import_sqlite_core.text)("to_json"),
        ccJson: (0, import_sqlite_core.text)("cc_json"),
        bccJson: (0, import_sqlite_core.text)("bcc_json"),
        replyToJson: (0, import_sqlite_core.text)("reply_to_json"),
        dateUtc: (0, import_sqlite_core.integer)("date_utc"),
        internalDate: (0, import_sqlite_core.integer)("internal_date"),
        size: (0, import_sqlite_core.integer)("size"),
        isRead: (0, import_sqlite_core.integer)("is_read", { mode: "boolean" }).notNull().default(false),
        isFlagged: (0, import_sqlite_core.integer)("is_flagged", { mode: "boolean" }).notNull().default(false),
        isAnswered: (0, import_sqlite_core.integer)("is_answered", { mode: "boolean" }).notNull().default(false),
        isDraft: (0, import_sqlite_core.integer)("is_draft", { mode: "boolean" }).notNull().default(false),
        hasAttachments: (0, import_sqlite_core.integer)("has_attachments", { mode: "boolean" }).notNull().default(false),
        snippet: (0, import_sqlite_core.text)("snippet"),
        threadId: (0, import_sqlite_core.text)("thread_id"),
        isSpam: (0, import_sqlite_core.integer)("is_spam", { mode: "boolean" }).notNull().default(false),
        spamScore: (0, import_sqlite_core.integer)("spam_score").notNull().default(0),
        spamReasons: (0, import_sqlite_core.text)("spam_reasons"),
        isImportant: (0, import_sqlite_core.integer)("is_important", { mode: "boolean" }).notNull().default(false),
        snoozedUntil: (0, import_sqlite_core.integer)("snoozed_until"),
        pop3Uidl: (0, import_sqlite_core.text)("pop3_uidl")
      },
      (table) => [
        (0, import_sqlite_core.uniqueIndex)("ux_messages_account_folder_uid").on(table.accountId, table.folderId, table.uid),
        (0, import_sqlite_core.index)("ix_messages_folder_date").on(table.accountId, table.folderId, table.dateUtc)
      ]
    );
    messageBodies = (0, import_sqlite_core.sqliteTable)("message_bodies", {
      messageId: (0, import_sqlite_core.text)("message_id").primaryKey().references(() => messages.id, { onDelete: "cascade" }),
      textPlain: (0, import_sqlite_core.text)("text_plain"),
      htmlRaw: (0, import_sqlite_core.text)("html_raw"),
      fetchedAt: (0, import_sqlite_core.integer)("fetched_at").notNull()
    });
    attachments = (0, import_sqlite_core.sqliteTable)(
      "attachments",
      {
        id: (0, import_sqlite_core.text)("id").primaryKey(),
        messageId: (0, import_sqlite_core.text)("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
        filename: (0, import_sqlite_core.text)("filename"),
        mimeType: (0, import_sqlite_core.text)("mime_type"),
        size: (0, import_sqlite_core.integer)("size"),
        contentId: (0, import_sqlite_core.text)("content_id"),
        isInline: (0, import_sqlite_core.integer)("is_inline", { mode: "boolean" }).notNull().default(false),
        contentPath: (0, import_sqlite_core.text)("content_path")
      },
      (table) => [(0, import_sqlite_core.index)("ix_attachments_message").on(table.messageId)]
    );
    notifications = (0, import_sqlite_core.sqliteTable)("notifications", {
      id: (0, import_sqlite_core.text)("id").primaryKey(),
      kind: (0, import_sqlite_core.text)("kind").notNull(),
      title: (0, import_sqlite_core.text)("title").notNull(),
      body: (0, import_sqlite_core.text)("body").notNull().default(""),
      at: (0, import_sqlite_core.integer)("at").notNull(),
      read: (0, import_sqlite_core.integer)("read", { mode: "boolean" }).notNull().default(false),
      accountId: (0, import_sqlite_core.text)("account_id"),
      messageId: (0, import_sqlite_core.text)("message_id"),
      threadId: (0, import_sqlite_core.text)("thread_id"),
      appId: (0, import_sqlite_core.text)("app_id"),
      appName: (0, import_sqlite_core.text)("app_name"),
      appNotifId: (0, import_sqlite_core.text)("app_notif_id"),
      count: (0, import_sqlite_core.integer)("count").notNull().default(1),
      nav: (0, import_sqlite_core.text)("nav")
    });
    spamSenders = (0, import_sqlite_core.sqliteTable)(
      "spam_senders",
      {
        id: (0, import_sqlite_core.text)("id").primaryKey(),
        accountId: (0, import_sqlite_core.text)("account_id").notNull(),
        email: (0, import_sqlite_core.text)("email").notNull(),
        kind: (0, import_sqlite_core.text)("kind").notNull(),
        createdAt: (0, import_sqlite_core.integer)("created_at").notNull()
      },
      (table) => [(0, import_sqlite_core.uniqueIndex)("ux_spam_senders_account_email").on(table.accountId, table.email)]
    );
    spamTokens = (0, import_sqlite_core.sqliteTable)("spam_tokens", {
      token: (0, import_sqlite_core.text)("token").primaryKey(),
      spamCount: (0, import_sqlite_core.integer)("spam_count").notNull().default(0),
      hamCount: (0, import_sqlite_core.integer)("ham_count").notNull().default(0)
    });
    accountOauth = (0, import_sqlite_core.sqliteTable)("account_oauth", {
      accountId: (0, import_sqlite_core.text)("account_id").primaryKey(),
      provider: (0, import_sqlite_core.text)("provider").notNull(),
      refreshTokenRef: (0, import_sqlite_core.text)("refresh_token_ref").notNull(),
      scope: (0, import_sqlite_core.text)("scope"),
      createdAt: (0, import_sqlite_core.integer)("created_at").notNull()
    });
    snippets = (0, import_sqlite_core.sqliteTable)("snippets", {
      id: (0, import_sqlite_core.text)("id").primaryKey(),
      name: (0, import_sqlite_core.text)("name").notNull(),
      body: (0, import_sqlite_core.text)("body").notNull(),
      createdAt: (0, import_sqlite_core.integer)("created_at").notNull()
    });
    scheduledSends = (0, import_sqlite_core.sqliteTable)("scheduled_sends", {
      id: (0, import_sqlite_core.text)("id").primaryKey(),
      accountId: (0, import_sqlite_core.text)("account_id").notNull(),
      payload: (0, import_sqlite_core.text)("payload").notNull(),
      sendAt: (0, import_sqlite_core.integer)("send_at").notNull(),
      createdAt: (0, import_sqlite_core.integer)("created_at").notNull()
    });
    outbox = (0, import_sqlite_core.sqliteTable)("outbox", {
      id: (0, import_sqlite_core.text)("id").primaryKey(),
      accountId: (0, import_sqlite_core.text)("account_id").notNull(),
      payload: (0, import_sqlite_core.text)("payload").notNull(),
      status: (0, import_sqlite_core.text)("status").notNull().default("queued"),
      error: (0, import_sqlite_core.text)("error"),
      attempts: (0, import_sqlite_core.integer)("attempts").notNull().default(0),
      sendAt: (0, import_sqlite_core.integer)("send_at").notNull(),
      createdAt: (0, import_sqlite_core.integer)("created_at").notNull(),
      updatedAt: (0, import_sqlite_core.integer)("updated_at").notNull()
    });
    threadSettings = (0, import_sqlite_core.sqliteTable)("thread_settings", {
      threadId: (0, import_sqlite_core.text)("thread_id").primaryKey(),
      muted: (0, import_sqlite_core.integer)("muted", { mode: "boolean" }).notNull().default(false),
      pinned: (0, import_sqlite_core.integer)("pinned", { mode: "boolean" }).notNull().default(false)
    });
    labels = (0, import_sqlite_core.sqliteTable)("labels", {
      id: (0, import_sqlite_core.text)("id").primaryKey(),
      name: (0, import_sqlite_core.text)("name").notNull(),
      color: (0, import_sqlite_core.text)("color").notNull(),
      createdAt: (0, import_sqlite_core.integer)("created_at").notNull()
    });
    messageLabels = (0, import_sqlite_core.sqliteTable)(
      "message_labels",
      {
        messageId: (0, import_sqlite_core.text)("message_id").notNull(),
        labelId: (0, import_sqlite_core.text)("label_id").notNull()
      },
      (table) => [(0, import_sqlite_core.index)("ix_message_labels_label").on(table.labelId)]
    );
    savedSearches = (0, import_sqlite_core.sqliteTable)("saved_searches", {
      id: (0, import_sqlite_core.text)("id").primaryKey(),
      name: (0, import_sqlite_core.text)("name").notNull(),
      query: (0, import_sqlite_core.text)("query").notNull(),
      createdAt: (0, import_sqlite_core.integer)("created_at").notNull()
    });
    rules = (0, import_sqlite_core.sqliteTable)(
      "rules",
      {
        id: (0, import_sqlite_core.text)("id").primaryKey(),
        accountId: (0, import_sqlite_core.text)("account_id").notNull(),
        name: (0, import_sqlite_core.text)("name").notNull(),
        isEnabled: (0, import_sqlite_core.integer)("is_enabled", { mode: "boolean" }).notNull().default(true),
        matchAll: (0, import_sqlite_core.integer)("match_all", { mode: "boolean" }).notNull().default(true),
        stopProcessing: (0, import_sqlite_core.integer)("stop_processing", { mode: "boolean" }).notNull().default(false),
        sortOrder: (0, import_sqlite_core.integer)("sort_order").notNull().default(0),
        createdAt: (0, import_sqlite_core.integer)("created_at").notNull()
      },
      (table) => [(0, import_sqlite_core.index)("ix_rules_account").on(table.accountId)]
    );
    ruleConditions = (0, import_sqlite_core.sqliteTable)(
      "rule_conditions",
      {
        id: (0, import_sqlite_core.text)("id").primaryKey(),
        ruleId: (0, import_sqlite_core.text)("rule_id").notNull().references(() => rules.id, { onDelete: "cascade" }),
        field: (0, import_sqlite_core.text)("field").notNull(),
        op: (0, import_sqlite_core.text)("op").notNull(),
        value: (0, import_sqlite_core.text)("value").notNull()
      },
      (table) => [(0, import_sqlite_core.index)("ix_rule_conditions_rule").on(table.ruleId)]
    );
    ruleActions = (0, import_sqlite_core.sqliteTable)(
      "rule_actions",
      {
        id: (0, import_sqlite_core.text)("id").primaryKey(),
        ruleId: (0, import_sqlite_core.text)("rule_id").notNull().references(() => rules.id, { onDelete: "cascade" }),
        action: (0, import_sqlite_core.text)("action").notNull(),
        value: (0, import_sqlite_core.text)("value")
      },
      (table) => [(0, import_sqlite_core.index)("ix_rule_actions_rule").on(table.ruleId)]
    );
    customWebApps = (0, import_sqlite_core.sqliteTable)("custom_web_apps", {
      id: (0, import_sqlite_core.text)("id").primaryKey(),
      name: (0, import_sqlite_core.text)("name").notNull(),
      url: (0, import_sqlite_core.text)("url").notNull(),
      manifestUrl: (0, import_sqlite_core.text)("manifest_url"),
      iconRef: (0, import_sqlite_core.text)("icon_ref"),
      windowMode: (0, import_sqlite_core.text)("window_mode").notNull().default("inline"),
      isPinned: (0, import_sqlite_core.integer)("is_pinned", { mode: "boolean" }).notNull().default(false),
      sortOrder: (0, import_sqlite_core.integer)("sort_order").notNull().default(0),
      createdAt: (0, import_sqlite_core.integer)("created_at").notNull(),
      // Load the app at startup so it can post notifications even before it's opened.
      runInBackground: (0, import_sqlite_core.integer)("run_in_background", { mode: "boolean" }).notNull().default(true),
      // Notification capture settings.
      notifyInBell: (0, import_sqlite_core.integer)("notify_in_bell", { mode: "boolean" }).notNull().default(true),
      notifyOsPopup: (0, import_sqlite_core.integer)("notify_os_popup", { mode: "boolean" }).notNull().default(true),
      notifyHidePreview: (0, import_sqlite_core.integer)("notify_hide_preview", { mode: "boolean" }).notNull().default(false)
    });
    calendars = (0, import_sqlite_core.sqliteTable)("calendars", {
      id: (0, import_sqlite_core.text)("id").primaryKey(),
      accountId: (0, import_sqlite_core.text)("account_id"),
      name: (0, import_sqlite_core.text)("name").notNull(),
      color: (0, import_sqlite_core.text)("color").notNull(),
      isVisible: (0, import_sqlite_core.integer)("is_visible", { mode: "boolean" }).notNull().default(true),
      kind: (0, import_sqlite_core.text)("kind").notNull().default("local"),
      url: (0, import_sqlite_core.text)("url"),
      username: (0, import_sqlite_core.text)("username"),
      secretRef: (0, import_sqlite_core.text)("secret_ref"),
      lastSyncAt: (0, import_sqlite_core.integer)("last_sync_at"),
      createdAt: (0, import_sqlite_core.integer)("created_at").notNull()
    });
    reminderLog = (0, import_sqlite_core.sqliteTable)("reminder_log", {
      eventId: (0, import_sqlite_core.text)("event_id").notNull(),
      occurrenceStart: (0, import_sqlite_core.integer)("occurrence_start").notNull(),
      createdAt: (0, import_sqlite_core.integer)("created_at").notNull()
    });
    calendarEvents = (0, import_sqlite_core.sqliteTable)(
      "calendar_events",
      {
        id: (0, import_sqlite_core.text)("id").primaryKey(),
        calendarId: (0, import_sqlite_core.text)("calendar_id").notNull().references(() => calendars.id, { onDelete: "cascade" }),
        uid: (0, import_sqlite_core.text)("uid"),
        sequence: (0, import_sqlite_core.integer)("sequence").notNull().default(0),
        summary: (0, import_sqlite_core.text)("summary"),
        description: (0, import_sqlite_core.text)("description"),
        location: (0, import_sqlite_core.text)("location"),
        startUtc: (0, import_sqlite_core.integer)("start_utc").notNull(),
        endUtc: (0, import_sqlite_core.integer)("end_utc").notNull(),
        isAllDay: (0, import_sqlite_core.integer)("is_all_day", { mode: "boolean" }).notNull().default(false),
        tzid: (0, import_sqlite_core.text)("tzid"),
        organizer: (0, import_sqlite_core.text)("organizer"),
        status: (0, import_sqlite_core.text)("status"),
        rrule: (0, import_sqlite_core.text)("rrule"),
        exdate: (0, import_sqlite_core.text)("exdate"),
        recurrenceId: (0, import_sqlite_core.text)("recurrence_id"),
        createdAt: (0, import_sqlite_core.integer)("created_at").notNull(),
        updatedAt: (0, import_sqlite_core.integer)("updated_at").notNull()
      },
      (table) => [(0, import_sqlite_core.index)("ix_calendar_events_calendar").on(table.calendarId, table.startUtc)]
    );
    calendarEventAttendees = (0, import_sqlite_core.sqliteTable)(
      "calendar_event_attendees",
      {
        id: (0, import_sqlite_core.text)("id").primaryKey(),
        eventId: (0, import_sqlite_core.text)("event_id").notNull().references(() => calendarEvents.id, { onDelete: "cascade" }),
        email: (0, import_sqlite_core.text)("email"),
        name: (0, import_sqlite_core.text)("name"),
        partstat: (0, import_sqlite_core.text)("partstat")
      },
      (table) => [(0, import_sqlite_core.index)("ix_calendar_attendees_event").on(table.eventId)]
    );
    schema = {
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
      notifications,
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
    };
  }
});

// src/mobile/engine/betterSqliteStub.ts
var BetterSqliteNotAvailable;
var init_betterSqliteStub = __esm({
  "src/mobile/engine/betterSqliteStub.ts"() {
    "use strict";
    BetterSqliteNotAvailable = class {
      constructor() {
        throw new Error("better-sqlite3 is not available on Android; node-sqlite3-wasm is used instead.");
      }
    };
  }
});

// src/core/db/driverWasm.ts
function openWasmDatabase(path) {
  return new WasmDatabaseHandle(path);
}
var import_node_sqlite3_wasm, WasmStatement, WasmDatabaseHandle;
var init_driverWasm = __esm({
  "src/core/db/driverWasm.ts"() {
    "use strict";
    import_node_sqlite3_wasm = require("node-sqlite3-wasm");
    WasmStatement = class _WasmStatement {
      constructor(stmt, rawMode) {
        this.stmt = stmt;
        this.rawMode = rawMode;
      }
      /** node-sqlite3-wasm binds an array; better-sqlite3 binds variadic params. */
      bind(values) {
        return values.length > 0 ? values : void 0;
      }
      run(...values) {
        const result = this.stmt.run(this.bind(values));
        return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
      }
      get(...values) {
        const row = this.stmt.get(this.bind(values));
        if (!row) return void 0;
        return this.rawMode ? Object.values(row) : row;
      }
      all(...values) {
        const rows = this.stmt.all(this.bind(values));
        return this.rawMode ? rows.map((row) => Object.values(row)) : rows;
      }
      // better-sqlite3's fluent modifiers. Drizzle only uses raw(); the rest are
      // no-ops kept for API compatibility.
      raw(toggle = true) {
        return new _WasmStatement(this.stmt, toggle);
      }
      pluck() {
        return this;
      }
      safeIntegers() {
        return this;
      }
      columns() {
        return [];
      }
    };
    WasmDatabaseHandle = class {
      db;
      open = true;
      constructor(path) {
        this.db = new import_node_sqlite3_wasm.Database(path);
      }
      prepare(sql3) {
        return new WasmStatement(this.db.prepare(sql3), false);
      }
      exec(sql3) {
        this.db.exec(sql3);
      }
      pragma(source) {
        try {
          const rows = this.db.all(`PRAGMA ${source}`);
          if (rows.length === 1) return Object.values(rows[0])[0];
          return rows;
        } catch {
          this.db.exec(`PRAGMA ${source}`);
          return void 0;
        }
      }
      // better-sqlite3's transaction() returns a function that also exposes
      // .deferred / .immediate / .exclusive variants; Drizzle calls one of them.
      transaction(fn) {
        const make = (behavior) => {
          return (...args) => {
            this.db.exec(`BEGIN ${behavior}`);
            try {
              const result = fn(...args);
              this.db.exec("COMMIT");
              return result;
            } catch (error) {
              this.db.exec("ROLLBACK");
              throw error;
            }
          };
        };
        const tx = make("DEFERRED");
        tx.deferred = make("DEFERRED");
        tx.immediate = make("IMMEDIATE");
        tx.exclusive = make("EXCLUSIVE");
        return tx;
      }
      close() {
        this.db.close();
        this.open = false;
      }
    };
  }
});

// src/core/db/driver.ts
function selectedDriver() {
  return process.env.CLOVER_DB_DRIVER === "wasm" ? "node-sqlite3-wasm" : "better-sqlite3";
}
function openDriver(path) {
  if (selectedDriver() === "node-sqlite3-wasm") {
    return openWasmDatabase(path);
  }
  return new BetterSqliteNotAvailable(path);
}
var init_driver = __esm({
  "src/core/db/driver.ts"() {
    "use strict";
    init_betterSqliteStub();
    init_driverWasm();
  }
});

// src/core/db/index.ts
function databasePath(dataDir) {
  return (0, import_node_path.join)(dataDir, "clover-mail.db");
}
function applyMigrations(handle) {
  handle.exec(`
    CREATE TABLE IF NOT EXISTS __migrations (
      id TEXT PRIMARY KEY NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);
  const applied = new Set(
    handle.prepare("SELECT id FROM __migrations").all().map((row) => row.id)
  );
  const record = handle.prepare(
    "INSERT INTO __migrations (id, applied_at) VALUES (?, ?)"
  );
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    const run = handle.transaction(() => {
      handle.exec(migration.sql);
      record.run(migration.id, Date.now());
    });
    run();
  }
}
function initDatabase(dataDir) {
  if (db) return db;
  (0, import_node_fs.mkdirSync)(dataDir, { recursive: true });
  sqlite = openDriver(databasePath(dataDir));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("synchronous = NORMAL");
  applyMigrations(sqlite);
  db = (0, import_better_sqlite32.drizzle)(sqlite, { schema: schema_exports });
  return db;
}
function getDb() {
  if (!db) throw new Error("Database not initialized. Call initDatabase(dataDir) first.");
  return db;
}
function getRawDb() {
  if (!sqlite) throw new Error("Database not initialized. Call initDatabase(dataDir) first.");
  return sqlite;
}
var import_better_sqlite32, import_node_path, import_node_fs, sqlite, db;
var init_db = __esm({
  "src/core/db/index.ts"() {
    "use strict";
    import_better_sqlite32 = require("drizzle-orm/better-sqlite3");
    import_node_path = require("node:path");
    import_node_fs = require("node:fs");
    init_migrations();
    init_schema();
    init_driver();
    sqlite = null;
    db = null;
  }
});

// src/core/mail/storage.ts
function setStorageRoot(dir) {
  root = dir;
}
function attachmentsRoot() {
  return (0, import_node_path2.join)(root, "attachments");
}
function safeSegment(value) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}
function saveAttachment(messageId, attachmentId, filename, data) {
  const dirName = safeSegment(messageId);
  const dir = (0, import_node_path2.join)(attachmentsRoot(), dirName);
  (0, import_node_fs2.mkdirSync)(dir, { recursive: true });
  const ext = filename ? (0, import_node_path2.extname)(filename).replace(/[^a-zA-Z0-9.]/g, "").slice(0, 12) : "";
  const rel = (0, import_node_path2.join)(dirName, `${attachmentId}${ext}`);
  (0, import_node_fs2.writeFileSync)((0, import_node_path2.join)(attachmentsRoot(), rel), data);
  return rel;
}
function attachmentAbsolutePath(rel) {
  return (0, import_node_path2.join)(attachmentsRoot(), rel);
}
function readAttachmentDataUrl(rel, mimeType, maxBytes = 3e6) {
  if (!rel) return null;
  const path = attachmentAbsolutePath(rel);
  if (!(0, import_node_fs2.existsSync)(path)) return null;
  const buffer = (0, import_node_fs2.readFileSync)(path);
  if (buffer.length > maxBytes) return null;
  return `data:${mimeType || "application/octet-stream"};base64,${buffer.toString("base64")}`;
}
var import_node_fs2, import_node_path2, root;
var init_storage = __esm({
  "src/core/mail/storage.ts"() {
    "use strict";
    import_node_fs2 = require("node:fs");
    import_node_path2 = require("node:path");
    root = "";
  }
});

// src/core/platform.ts
function setPlatform(next) {
  impl = next;
}
function platform() {
  if (!impl) throw new Error("Platform not configured");
  return impl;
}
var impl;
var init_platform = __esm({
  "src/core/platform.ts"() {
    "use strict";
    impl = null;
  }
});

// src/core/transport/registry.ts
function registerChannel(channel, handler) {
  handlers.set(channel, handler);
}
async function dispatch(channel, args) {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`Unknown channel: ${channel}`);
  return await handler(...args);
}
var handlers;
var init_registry = __esm({
  "src/core/transport/registry.ts"() {
    "use strict";
    handlers = /* @__PURE__ */ new Map();
  }
});

// src/mobile/engine/platform.ts
function androidPlatform() {
  return {
    async showSaveDialog() {
      return { canceled: true, filePath: void 0 };
    },
    async showOpenDialog() {
      return { canceled: true, filePaths: [] };
    },
    async openPath() {
      return "";
    },
    encryptSecret() {
      return null;
    },
    decryptSecret() {
      return null;
    }
  };
}
var init_platform2 = __esm({
  "src/mobile/engine/platform.ts"() {
    "use strict";
  }
});

// src/shared/channels.ts
var IpcChannels;
var init_channels = __esm({
  "src/shared/channels.ts"() {
    "use strict";
    IpcChannels = {
      appInfo: "app:info",
      settingsGetAll: "settings:getAll",
      settingsGet: "settings:get",
      settingsSet: "settings:set",
      settingsDelete: "settings:delete",
      windowMinimize: "window:minimize",
      windowToggleMaximize: "window:toggle-maximize",
      windowClose: "window:close",
      windowIsMaximized: "window:is-maximized",
      windowMaximizedChanged: "window:maximized-changed",
      appSetUnread: "app:set-unread",
      appSetTaskbarBadge: "app:set-taskbar-badge",
      appNavigate: "app:navigate",
      appOpenLicenses: "app:open-licenses",
      appReadLicenses: "app:read-licenses",
      appReadLogs: "app:read-logs",
      notificationsList: "notifications:list",
      notificationsSave: "notifications:save",
      appNotify: "app:notify",
      mail: {
        listAccounts: "mail:list-accounts",
        createAccount: "mail:create-account",
        updateAccount: "mail:update-account",
        deleteAccount: "mail:delete-account",
        testConnection: "mail:test-connection",
        syncAccount: "mail:sync-account",
        syncFolder: "mail:sync-folder",
        listFolders: "mail:list-folders",
        listMessages: "mail:list-messages",
        listThreads: "mail:list-threads",
        hasOlderMessages: "mail:has-older-messages",
        notificationStatus: "mail:notification-status",
        listJunk: "mail:list-junk",
        spamCount: "mail:spam-count",
        listImportant: "mail:list-important",
        importantCount: "mail:important-count",
        listUnifiedThreads: "mail:list-unified-threads",
        listUnifiedMessages: "mail:list-unified-messages",
        markSpam: "mail:mark-spam",
        markNotSpam: "mail:mark-not-spam",
        blockSender: "mail:block-sender",
        allowSender: "mail:allow-sender",
        createFolder: "mail:create-folder",
        renameFolder: "mail:rename-folder",
        deleteFolder: "mail:delete-folder",
        setFolderVisible: "mail:set-folder-visible",
        exportMbox: "mail:export-mbox",
        listAliases: "mail:list-aliases",
        addAlias: "mail:add-alias",
        deleteAlias: "mail:delete-alias",
        getDefaultFrom: "mail:get-default-from",
        setDefaultFrom: "mail:set-default-from",
        oauthStart: "mail:oauth-start",
        oauthGoogleConfigured: "mail:oauth-google-configured",
        oauthGetGoogleConfig: "mail:oauth-get-google-config",
        oauthSetGoogleConfig: "mail:oauth-set-google-config",
        oauthStartMicrosoft: "mail:oauth-start-microsoft",
        oauthMicrosoftConfigured: "mail:oauth-microsoft-configured",
        oauthGetMicrosoftConfig: "mail:oauth-get-microsoft-config",
        oauthSetMicrosoftConfig: "mail:oauth-set-microsoft-config",
        listRules: "mail:list-rules",
        createRule: "mail:create-rule",
        updateRule: "mail:update-rule",
        deleteRule: "mail:delete-rule",
        applyRules: "mail:apply-rules",
        getMessage: "mail:get-message",
        getConversation: "mail:get-conversation",
        setFlags: "mail:set-flags",
        moveMessage: "mail:move-message",
        deleteMessage: "mail:delete-message",
        bulkAction: "mail:bulk-action",
        undoMoves: "mail:undo-moves",
        emptyFolder: "mail:empty-folder",
        markFolderRead: "mail:mark-folder-read",
        deleteSpam: "mail:delete-spam",
        sendMessage: "mail:send-message",
        outboxList: "mail:outbox-list",
        outboxRetry: "mail:outbox-retry",
        outboxDiscard: "mail:outbox-discard",
        saveDraft: "mail:save-draft",
        deleteDraft: "mail:delete-draft",
        downloadAttachment: "mail:download-attachment",
        attachmentPath: "mail:attachment-path",
        openAttachment: "mail:open-attachment",
        readAttachmentText: "mail:read-attachment-text",
        search: "mail:search",
        searchServer: "mail:search-server",
        listSnippets: "mail:list-snippets",
        addSnippet: "mail:add-snippet",
        deleteSnippet: "mail:delete-snippet",
        snooze: "mail:snooze",
        unsnooze: "mail:unsnooze",
        scheduleSend: "mail:schedule-send",
        listScheduled: "mail:list-scheduled",
        cancelScheduled: "mail:cancel-scheduled",
        setThreadMuted: "mail:set-thread-muted",
        setThreadPinned: "mail:set-thread-pinned",
        threadParticipants: "mail:thread-participants",
        listLabels: "mail:list-labels",
        createLabel: "mail:create-label",
        deleteLabel: "mail:delete-label",
        addLabelToMessage: "mail:add-label-to-message",
        removeLabelFromMessage: "mail:remove-label-from-message",
        listLabelMessages: "mail:list-label-messages",
        labelsForMessage: "mail:labels-for-message",
        listSavedSearches: "mail:list-saved-searches",
        createSavedSearch: "mail:create-saved-search",
        deleteSavedSearch: "mail:delete-saved-search",
        importMbox: "mail:import-mbox",
        pickImportMbox: "mail:pick-import-mbox",
        events: "mail:events"
      },
      apps: {
        list: "apps:list",
        create: "apps:create",
        remove: "apps:remove",
        update: "apps:update"
      },
      calendar: {
        listCalendars: "calendar:list-calendars",
        createCalendar: "calendar:create-calendar",
        listOccurrences: "calendar:list-occurrences",
        getEvent: "calendar:get-event",
        createEvent: "calendar:create-event",
        updateEvent: "calendar:update-event",
        deleteEvent: "calendar:delete-event",
        importPath: "calendar:import-path",
        importAttachment: "calendar:import-attachment",
        pickAndImport: "calendar:pick-and-import",
        exportIcs: "calendar:export-ics",
        addCaldav: "calendar:add-caldav",
        syncCalendar: "calendar:sync-calendar",
        removeCalendar: "calendar:remove-calendar"
      },
      ai: {
        getSettings: "ai:get-settings",
        setSettings: "ai:set-settings",
        status: "ai:status",
        listModels: "ai:list-models",
        chat: "ai:chat",
        cancel: "ai:cancel",
        stream: "ai:stream",
        getMcpSettings: "ai:get-mcp-settings",
        setMcpSettings: "ai:set-mcp-settings",
        mcpStart: "ai:mcp-start",
        mcpStop: "ai:mcp-stop"
      },
      wallpaper: {
        pickFile: "wallpaper:pick-file",
        pickFolder: "wallpaper:pick-folder",
        listFolder: "wallpaper:list-folder",
        detectEngine: "wallpaper:detect-engine"
      },
      backup: {
        export: "backup:export",
        import: "backup:import"
      },
      dictation: {
        start: "dictation:start",
        stop: "dictation:stop",
        supported: "dictation:supported",
        event: "dictation:event"
      },
      update: {
        check: "update:check",
        download: "update:download",
        install: "update:install",
        event: "update:event"
      }
    };
  }
});

// src/mobile/engine/events.ts
function setMailPoster(next) {
  poster = next;
}
function createMailEmit(_getWindow) {
  return (event) => poster(IpcChannels.mail.events, event);
}
var poster;
var init_events = __esm({
  "src/mobile/engine/events.ts"() {
    "use strict";
    init_channels();
    poster = () => {
    };
  }
});

// src/shared/ipc.ts
var import_zod, AppInfoSchema, SettingsRecordSchema;
var init_ipc = __esm({
  "src/shared/ipc.ts"() {
    "use strict";
    import_zod = require("zod");
    AppInfoSchema = import_zod.z.object({
      name: import_zod.z.string(),
      version: import_zod.z.string(),
      electron: import_zod.z.string(),
      chrome: import_zod.z.string(),
      node: import_zod.z.string(),
      platform: import_zod.z.string(),
      userDataPath: import_zod.z.string(),
      isPackaged: import_zod.z.boolean()
    });
    SettingsRecordSchema = import_zod.z.record(import_zod.z.string(), import_zod.z.unknown());
  }
});

// src/core/settings/index.ts
function parse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
function getAllSettings() {
  const rows = getDb().select().from(appSettings).all();
  const out = {};
  for (const row of rows) {
    out[row.key] = parse(row.value);
  }
  return out;
}
function getSetting(key2) {
  const row = getDb().select().from(appSettings).where((0, import_drizzle_orm.eq)(appSettings.key, key2)).get();
  return row ? parse(row.value) : void 0;
}
function setSetting(key2, value) {
  const serialized = JSON.stringify(value ?? null);
  getDb().insert(appSettings).values({ key: key2, value: serialized, updatedAt: Date.now() }).onConflictDoUpdate({
    target: appSettings.key,
    set: { value: serialized, updatedAt: Date.now() }
  }).run();
}
function deleteSetting(key2) {
  getDb().delete(appSettings).where((0, import_drizzle_orm.eq)(appSettings.key, key2)).run();
}
var import_drizzle_orm;
var init_settings = __esm({
  "src/core/settings/index.ts"() {
    "use strict";
    import_drizzle_orm = require("drizzle-orm");
    init_db();
    init_schema();
  }
});

// src/core/notifications.ts
function listNotifications() {
  return getDb().select().from(notifications).orderBy((0, import_drizzle_orm2.desc)(notifications.at)).limit(MAX).all().map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    at: row.at,
    read: row.read,
    accountId: row.accountId ?? void 0,
    messageId: row.messageId ?? void 0,
    threadId: row.threadId ?? void 0,
    appId: row.appId ?? void 0,
    appName: row.appName ?? void 0,
    appNotifId: row.appNotifId ?? void 0,
    count: row.count,
    nav: row.nav ?? void 0
  }));
}
function saveNotifications(items) {
  const db2 = getDb();
  db2.transaction((tx) => {
    tx.delete(notifications).run();
    for (const n of items.slice(0, MAX)) {
      tx.insert(notifications).values({
        id: n.id,
        kind: n.kind,
        title: n.title,
        body: n.body ?? "",
        at: n.at,
        read: n.read,
        accountId: n.accountId ?? null,
        messageId: n.messageId ?? null,
        threadId: n.threadId ?? null,
        appId: n.appId ?? null,
        appName: n.appName ?? null,
        appNotifId: n.appNotifId ?? null,
        count: n.count ?? 1,
        nav: n.nav ?? null
      }).run();
    }
  });
}
var import_drizzle_orm2, MAX;
var init_notifications = __esm({
  "src/core/notifications.ts"() {
    "use strict";
    import_drizzle_orm2 = require("drizzle-orm");
    init_db();
    init_schema();
    MAX = 50;
  }
});

// src/mobile/engine/ipcHost.ts
var noEvent, ipcHost;
var init_ipcHost = __esm({
  "src/mobile/engine/ipcHost.ts"() {
    "use strict";
    init_registry();
    noEvent = {};
    ipcHost = {
      handle(channel, handler) {
        registerChannel(channel, (...args) => handler(noEvent, ...args));
      },
      on(_channel, _handler) {
      }
    };
  }
});

// src/core/settings/secrets.ts
function setSecret(key2, plaintext) {
  const encrypted = platform().encryptSecret(plaintext);
  if (encrypted) {
    setSetting(PREFIX + key2, { encrypted: true, value: encrypted });
  } else {
    setSetting(PREFIX + key2, { encrypted: false, value: plaintext });
  }
}
function getSecret(key2) {
  const record = getSetting(PREFIX + key2);
  if (!record) return void 0;
  if (!record.encrypted) return record.value;
  return platform().decryptSecret(record.value) ?? void 0;
}
function deleteSecret(key2) {
  deleteSetting(PREFIX + key2);
}
var PREFIX;
var init_secrets = __esm({
  "src/core/settings/secrets.ts"() {
    "use strict";
    init_settings();
    init_platform();
    PREFIX = "secret:";
  }
});

// src/core/mail/accounts.ts
function authTypeFor(accountId) {
  const row = getDb().select().from(accountOauth).where((0, import_drizzle_orm3.eq)(accountOauth.accountId, accountId)).get();
  return row ? "oauth" : "password";
}
function makeSummary(account, incoming, outgoing) {
  return {
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    color: account.color,
    isEnabled: account.isEnabled,
    authType: authTypeFor(account.id),
    incoming: {
      host: incoming.host,
      port: incoming.port,
      security: incoming.security,
      username: incoming.username,
      protocol: incoming.protocol ?? "imap"
    },
    outgoing: {
      host: outgoing.host,
      port: outgoing.port,
      security: outgoing.security,
      username: outgoing.username
    }
  };
}
function settingsFor(accountId) {
  const incoming = getDb().select().from(incomingSettings).where((0, import_drizzle_orm3.eq)(incomingSettings.accountId, accountId)).get();
  const outgoing = getDb().select().from(outgoingSettings).where((0, import_drizzle_orm3.eq)(outgoingSettings.accountId, accountId)).get();
  return { incoming, outgoing };
}
function secretRefFor(accountId) {
  return `account:${accountId}:password`;
}
function localSummary(account) {
  const blank = {
    host: "",
    port: 0,
    security: "none",
    username: account.email,
    protocol: "local"
  };
  return {
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    color: account.color,
    isEnabled: account.isEnabled,
    authType: "password",
    incoming: blank,
    outgoing: { ...blank }
  };
}
function protocolFor(accountId) {
  const db2 = getDb();
  const account = db2.select().from(accounts).where((0, import_drizzle_orm3.eq)(accounts.id, accountId)).get();
  if (!account) return "imap";
  if (account.isLocal) return "local";
  const incoming = db2.select().from(incomingSettings).where((0, import_drizzle_orm3.eq)(incomingSettings.accountId, accountId)).get();
  return incoming?.protocol === "pop3" ? "pop3" : "imap";
}
function ensureLocalAccount(email, displayName) {
  const db2 = getDb();
  const existing = db2.select().from(accounts).where((0, import_drizzle_orm3.eq)(accounts.email, email)).get();
  if (existing) return localSummary(existing);
  const id = (0, import_node_crypto.randomUUID)();
  db2.insert(accounts).values({
    id,
    email,
    displayName,
    color: COLORS[listAccounts().length % COLORS.length],
    isEnabled: true,
    isLocal: true,
    createdAt: Date.now()
  }).run();
  return localSummary(db2.select().from(accounts).where((0, import_drizzle_orm3.eq)(accounts.id, id)).get());
}
function listAccounts() {
  const rows = getDb().select().from(accounts).orderBy((0, import_drizzle_orm3.asc)(accounts.createdAt)).all();
  const out = [];
  for (const row of rows) {
    const { incoming, outgoing } = settingsFor(row.id);
    if (incoming && outgoing) out.push(makeSummary(row, incoming, outgoing));
    else if (row.isLocal) out.push(localSummary(row));
  }
  return out;
}
function getAccountById(id) {
  const row = getDb().select().from(accounts).where((0, import_drizzle_orm3.eq)(accounts.id, id)).get();
  if (!row) return null;
  const { incoming, outgoing } = settingsFor(id);
  if (!incoming || !outgoing) return row.isLocal ? localSummary(row) : null;
  return makeSummary(row, incoming, outgoing);
}
function getAccountPassword(id) {
  return getSecret(secretRefFor(id));
}
function createAccount(input) {
  const id = (0, import_node_crypto.randomUUID)();
  const ref = secretRefFor(id);
  const now = Date.now();
  getDb().insert(accounts).values({
    id,
    email: input.email,
    displayName: input.displayName ?? input.email,
    color: COLORS[listAccounts().length % COLORS.length],
    isEnabled: true,
    createdAt: now
  }).run();
  getDb().insert(incomingSettings).values({
    id: (0, import_node_crypto.randomUUID)(),
    accountId: id,
    protocol: input.protocol ?? "imap",
    host: input.incoming.host,
    port: input.incoming.port,
    security: input.incoming.security,
    username: input.incoming.username,
    secretRef: ref
  }).run();
  getDb().insert(outgoingSettings).values({
    id: (0, import_node_crypto.randomUUID)(),
    accountId: id,
    host: input.outgoing.host,
    port: input.outgoing.port,
    security: input.outgoing.security,
    username: input.outgoing.username,
    secretRef: ref
  }).run();
  setSecret(ref, input.password);
  return getAccountById(id);
}
function updateAccount(id, input) {
  getDb().update(accounts).set({ email: input.email, displayName: input.displayName ?? input.email }).where((0, import_drizzle_orm3.eq)(accounts.id, id)).run();
  getDb().update(incomingSettings).set({
    host: input.incoming.host,
    port: input.incoming.port,
    security: input.incoming.security,
    username: input.incoming.username
  }).where((0, import_drizzle_orm3.eq)(incomingSettings.accountId, id)).run();
  getDb().update(outgoingSettings).set({
    host: input.outgoing.host,
    port: input.outgoing.port,
    security: input.outgoing.security,
    username: input.outgoing.username
  }).where((0, import_drizzle_orm3.eq)(outgoingSettings.accountId, id)).run();
  return getAccountById(id);
}
function deleteAccount(id) {
  deleteSecret(secretRefFor(id));
  getDb().delete(accounts).where((0, import_drizzle_orm3.eq)(accounts.id, id)).run();
}
var import_node_crypto, import_drizzle_orm3, COLORS;
var init_accounts = __esm({
  "src/core/mail/accounts.ts"() {
    "use strict";
    import_node_crypto = require("node:crypto");
    import_drizzle_orm3 = require("drizzle-orm");
    init_db();
    init_schema();
    init_secrets();
    COLORS = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#f43f5e", "#64748b"];
  }
});

// src/core/mail/imap.ts
function buildImapClient(settings, auth, timeouts = {}) {
  const secure = settings.security === "ssl";
  const client = new import_imapflow.ImapFlow({
    host: settings.host,
    port: settings.port,
    secure,
    auth: auth.accessToken ? { user: auth.user, accessToken: auth.accessToken } : { user: auth.user, pass: auth.pass ?? "" },
    doSTARTTLS: settings.security === "starttls",
    tls: { rejectUnauthorized: settings.security !== "none" },
    logger: false,
    emitLogs: false,
    connectionTimeout: timeouts.connectionTimeout ?? 2e4,
    greetingTimeout: timeouts.greetingTimeout ?? 15e3,
    socketTimeout: timeouts.socketTimeout ?? 6e4
  });
  client.on("error", () => void 0);
  return client;
}
async function testImap(settings, auth) {
  const client = buildImapClient(settings, auth);
  await client.connect();
  try {
    await client.list();
    return "IMAP connection succeeded";
  } finally {
    await client.logout().catch(() => void 0);
  }
}
var import_imapflow;
var init_imap = __esm({
  "src/core/mail/imap.ts"() {
    "use strict";
    import_imapflow = require("imapflow");
  }
});

// src/core/mail/smtp.ts
function buildTransport(settings, auth) {
  return import_nodemailer.default.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.security === "ssl",
    requireTLS: settings.security === "starttls",
    ignoreTLS: settings.security === "none",
    auth: auth.accessToken ? { type: "OAuth2", user: auth.user, accessToken: auth.accessToken } : { user: auth.user, pass: auth.pass ?? "" },
    connectionTimeout: 2e4,
    greetingTimeout: 15e3,
    socketTimeout: 6e4
  });
}
async function testSmtp(settings, auth) {
  const transport = buildTransport(settings, auth);
  try {
    await transport.verify();
    return "SMTP connection succeeded";
  } finally {
    transport.close();
  }
}
var import_nodemailer;
var init_smtp = __esm({
  "src/core/mail/smtp.ts"() {
    "use strict";
    import_nodemailer = __toESM(require("nodemailer"));
  }
});

// src/core/oauth/google.ts
async function refreshGoogleAccessToken(clientId, clientSecret, refreshToken) {
  const body = new URLSearchParams({
    client_id: clientId,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });
  if (clientSecret) body.set("client_secret", clientSecret);
  try {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    });
    if (!response.ok) return null;
    const json = await response.json();
    return json.access_token ?? null;
  } catch {
    return null;
  }
}
var TOKEN_URL;
var init_google = __esm({
  "src/core/oauth/google.ts"() {
    "use strict";
    TOKEN_URL = "https://oauth2.googleapis.com/token";
  }
});

// src/core/oauth/microsoft.ts
async function refreshMicrosoftAccessToken(clientId, clientSecret, refreshToken) {
  const body = new URLSearchParams({
    client_id: clientId,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    scope: MICROSOFT_SCOPE
  });
  if (clientSecret) body.set("client_secret", clientSecret);
  try {
    const response = await fetch(TOKEN_URL2, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    });
    if (!response.ok) return null;
    const json = await response.json();
    return json.access_token ?? null;
  } catch {
    return null;
  }
}
var TOKEN_URL2, MICROSOFT_SCOPE;
var init_microsoft = __esm({
  "src/core/oauth/microsoft.ts"() {
    "use strict";
    TOKEN_URL2 = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
    MICROSOFT_SCOPE = "offline_access openid email profile https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send";
  }
});

// src/core/oauth/config.ts
function getGoogleConfig() {
  return {
    clientId: getSetting(GOOGLE_ID) ?? "",
    clientSecret: getSecret(GOOGLE_SECRET) ?? ""
  };
}
function getMicrosoftConfig() {
  return {
    clientId: getSetting(MS_ID) ?? "",
    clientSecret: getSecret(MS_SECRET) ?? ""
  };
}
async function refreshGoogle(refreshToken) {
  const cfg = getGoogleConfig();
  if (!cfg.clientId) return null;
  return refreshGoogleAccessToken(cfg.clientId, cfg.clientSecret, refreshToken);
}
async function refreshMicrosoft(refreshToken) {
  const cfg = getMicrosoftConfig();
  if (!cfg.clientId) return null;
  return refreshMicrosoftAccessToken(cfg.clientId, cfg.clientSecret, refreshToken);
}
var GOOGLE_ID, GOOGLE_SECRET, MS_ID, MS_SECRET;
var init_config = __esm({
  "src/core/oauth/config.ts"() {
    "use strict";
    init_secrets();
    init_settings();
    init_google();
    init_microsoft();
    GOOGLE_ID = "oauth.google.clientId";
    GOOGLE_SECRET = "oauth.google.clientSecret";
    MS_ID = "oauth.microsoft.clientId";
    MS_SECRET = "oauth.microsoft.clientSecret";
  }
});

// src/core/mail/auth.ts
async function getAccountAuth(accountId) {
  const account = getAccountById(accountId);
  if (!account) return null;
  const oauth = getDb().select().from(accountOauth).where((0, import_drizzle_orm4.eq)(accountOauth.accountId, accountId)).get();
  if (oauth) {
    const refresh = getSecret(oauth.refreshTokenRef);
    if (!refresh) return null;
    const accessToken = oauth.provider === "google" ? await refreshGoogle(refresh) : oauth.provider === "microsoft" ? await refreshMicrosoft(refresh) : null;
    if (!accessToken) return null;
    return { user: account.incoming.username, accessToken };
  }
  const pass = getAccountPassword(accountId);
  if (!pass) return null;
  return { user: account.incoming.username, pass };
}
async function buildAccountClient(accountId) {
  const account = getAccountById(accountId);
  if (!account) throw new Error("Account not found");
  const auth = await getAccountAuth(accountId);
  if (!auth) throw new Error("No credentials for account");
  return buildImapClient(account.incoming, auth);
}
var import_drizzle_orm4;
var init_auth = __esm({
  "src/core/mail/auth.ts"() {
    "use strict";
    import_drizzle_orm4 = require("drizzle-orm");
    init_db();
    init_schema();
    init_accounts();
    init_imap();
    init_secrets();
    init_config();
  }
});

// src/core/mail/connection.ts
function withImap(accountId, fn) {
  const entry = pool.get(accountId) ?? { client: null, chain: Promise.resolve() };
  pool.set(accountId, entry);
  const run = entry.chain.then(async () => {
    if (!entry.client || !entry.client.usable) {
      entry.client = await buildAccountClient(accountId);
      await entry.client.connect();
    }
    try {
      return await fn(entry.client);
    } catch (error) {
      try {
        entry.client.close();
      } catch {
      }
      entry.client = null;
      throw error;
    }
  });
  entry.chain = run.then(
    () => void 0,
    () => void 0
  );
  return run;
}
var pool;
var init_connection = __esm({
  "src/core/mail/connection.ts"() {
    "use strict";
    init_auth();
    pool = /* @__PURE__ */ new Map();
  }
});

// src/core/mail/mappers.ts
function toMessageSummary(row) {
  return {
    id: row.id,
    accountId: row.accountId,
    folderId: row.folderId,
    uid: row.uid,
    subject: row.subject,
    fromName: row.fromName,
    fromEmail: row.fromEmail,
    dateUtc: row.dateUtc,
    snippet: row.snippet,
    isRead: row.isRead,
    isFlagged: row.isFlagged,
    hasAttachments: row.hasAttachments,
    spamScore: row.spamScore,
    isSpam: row.isSpam,
    isImportant: row.isImportant,
    threadId: row.threadId
  };
}
function toAttachmentSummary(row) {
  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mimeType,
    size: row.size,
    isInline: row.isInline,
    available: row.contentPath !== null
  };
}
var init_mappers = __esm({
  "src/core/mail/mappers.ts"() {
    "use strict";
  }
});

// src/core/mail/search.ts
function indexMessage(messageId) {
  const db2 = getDb();
  const row = db2.select().from(messages).where((0, import_drizzle_orm5.eq)(messages.id, messageId)).get();
  if (!row) return;
  const body = db2.select().from(messageBodies).where((0, import_drizzle_orm5.eq)(messageBodies.messageId, messageId)).get();
  const raw = getRawDb();
  raw.prepare("DELETE FROM messages_fts WHERE message_id = ?").run(messageId);
  raw.prepare(
    `INSERT INTO messages_fts (message_id, subject, from_name, from_email, snippet, body)
       VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    messageId,
    row.subject ?? "",
    row.fromName ?? "",
    row.fromEmail ?? "",
    row.snippet ?? "",
    body?.textPlain ?? ""
  );
}
function removeFromIndex(messageId) {
  getRawDb().prepare("DELETE FROM messages_fts WHERE message_id = ?").run(messageId);
}
function buildFtsQuery(input) {
  const tokens = input.trim().split(/\s+/).filter(Boolean).map((token) => token.replace(/["]/g, "").replace(/[*()]/g, "")).filter(Boolean);
  if (tokens.length === 0) return "";
  return tokens.map((token) => `"${token}"*`).join(" AND ");
}
function parseDate(value) {
  const t = Date.parse(value);
  return Number.isNaN(t) ? void 0 : t;
}
function parseSearch(input) {
  const result = { text: "" };
  const tokens = [];
  const re = /(\w+):("([^"]*)"|\S+)|"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(input)) !== null) {
    const key2 = m[1]?.toLowerCase();
    const val = (m[3] ?? m[2] ?? m[4] ?? m[5] ?? "").replace(/^"|"$/g, "");
    if (m[1] && val !== "") {
      switch (key2) {
        case "from":
          result.from = val;
          break;
        case "to":
          result.to = val;
          break;
        case "subject":
          result.subject = val;
          break;
        case "body":
        case "text":
          tokens.push(val);
          break;
        case "has":
          if (val === "attachment" || val === "attachments") result.hasAttachment = true;
          break;
        case "is":
          if (val === "unread") result.isUnread = true;
          else if (val === "read") result.isRead = true;
          else if (val === "flagged" || val === "starred") result.isFlagged = true;
          else if (val === "important") result.isImportant = true;
          break;
        case "in":
          result.inFolder = val;
          break;
        case "label":
          result.label = val;
          break;
        case "before":
          result.before = parseDate(val);
          break;
        case "after":
          result.after = parseDate(val);
          break;
        default:
          tokens.push(m[0]);
      }
    } else {
      const word = m[4] ?? m[5];
      if (word) tokens.push(word);
    }
  }
  result.text = tokens.join(" ");
  return result;
}
function searchMessages(query, accountId) {
  const parsed = parseSearch(query);
  const conditions = [];
  if (accountId) conditions.push((0, import_drizzle_orm5.eq)(messages.accountId, accountId));
  if (parsed.text.trim()) {
    const fts = buildFtsQuery(parsed.text);
    const ids = fts ? getRawDb().prepare("SELECT message_id FROM messages_fts WHERE messages_fts MATCH ? LIMIT 300").all(fts).map((hit) => hit.message_id) : [];
    if (ids.length === 0) return [];
    conditions.push((0, import_drizzle_orm5.inArray)(messages.id, ids));
  }
  if (parsed.from)
    conditions.push(
      (0, import_drizzle_orm5.or)(
        (0, import_drizzle_orm5.like)(messages.fromEmail, `%${parsed.from}%`),
        (0, import_drizzle_orm5.like)(messages.fromName, `%${parsed.from}%`)
      )
    );
  if (parsed.to)
    conditions.push(
      (0, import_drizzle_orm5.or)((0, import_drizzle_orm5.like)(messages.toJson, `%${parsed.to}%`), (0, import_drizzle_orm5.like)(messages.ccJson, `%${parsed.to}%`))
    );
  if (parsed.subject) conditions.push((0, import_drizzle_orm5.like)(messages.subject, `%${parsed.subject}%`));
  if (parsed.hasAttachment) conditions.push((0, import_drizzle_orm5.eq)(messages.hasAttachments, true));
  if (parsed.isUnread) conditions.push((0, import_drizzle_orm5.eq)(messages.isRead, false));
  if (parsed.isRead) conditions.push((0, import_drizzle_orm5.eq)(messages.isRead, true));
  if (parsed.isFlagged) conditions.push((0, import_drizzle_orm5.eq)(messages.isFlagged, true));
  if (parsed.isImportant) conditions.push((0, import_drizzle_orm5.eq)(messages.isImportant, true));
  if (parsed.before) conditions.push((0, import_drizzle_orm5.lt)(messages.dateUtc, parsed.before));
  if (parsed.after) conditions.push((0, import_drizzle_orm5.gt)(messages.dateUtc, parsed.after));
  const db2 = getDb();
  if (parsed.inFolder) {
    const matching = db2.select().from(folders).where((0, import_drizzle_orm5.like)(folders.name, `%${parsed.inFolder}%`)).all();
    const folderIds = matching.map((f) => f.id);
    if (folderIds.length === 0) return [];
    conditions.push((0, import_drizzle_orm5.inArray)(messages.folderId, folderIds));
  }
  if (parsed.label) {
    const needle = parsed.label.toLowerCase();
    const labelRow = db2.select().from(labels).all().find((l) => l.name.toLowerCase() === needle);
    if (!labelRow) return [];
    const msgIds = db2.select().from(messageLabels).where((0, import_drizzle_orm5.eq)(messageLabels.labelId, labelRow.id)).all().map((r) => r.messageId);
    if (msgIds.length === 0) return [];
    conditions.push((0, import_drizzle_orm5.inArray)(messages.id, msgIds));
  }
  if (conditions.length === 0) return [];
  return db2.select().from(messages).where((0, import_drizzle_orm5.and)(...conditions)).all().sort((a, b) => (b.dateUtc ?? 0) - (a.dateUtc ?? 0)).map(toMessageSummary);
}
async function searchServer(accountId, query) {
  if (protocolFor(accountId) !== "imap") return [];
  const parsed = parseSearch(query);
  const clauses = [];
  if (parsed.text) clauses.push({ body: parsed.text });
  if (parsed.subject) clauses.push({ subject: parsed.subject });
  if (parsed.from) clauses.push({ from: parsed.from });
  if (parsed.to) clauses.push({ to: parsed.to });
  if (clauses.length === 0) return [];
  const criteria = clauses.length === 1 ? clauses[0] : { or: clauses };
  const db2 = getDb();
  const folderRows = db2.select().from(folders).where((0, import_drizzle_orm5.eq)(folders.accountId, accountId)).all();
  const ids = /* @__PURE__ */ new Set();
  await withImap(accountId, async (client) => {
    for (const folder of folderRows) {
      if (ids.size >= 200) break;
      try {
        await client.mailboxOpen(folder.remotePath, { readOnly: true });
        const uids = await client.search(criteria, { uid: true });
        if (!uids || uids.length === 0) continue;
        const subset = uids.slice(-100);
        for await (const msg of client.fetch(
          subset,
          { uid: true, envelope: true, flags: true, internalDate: true, size: true, bodyStructure: true },
          { uid: true }
        )) {
          upsertMessage(accountId, folder.id, msg);
          ids.add(`${folder.id}:${msg.uid}`);
        }
      } catch {
      }
      await client.mailboxClose().catch(() => void 0);
    }
  });
  if (ids.size === 0) return [];
  return db2.select().from(messages).where((0, import_drizzle_orm5.inArray)(messages.id, [...ids])).all().sort((a, b) => (b.dateUtc ?? 0) - (a.dateUtc ?? 0)).map(toMessageSummary);
}
var import_drizzle_orm5;
var init_search = __esm({
  "src/core/mail/search.ts"() {
    "use strict";
    import_drizzle_orm5 = require("drizzle-orm");
    init_db();
    init_schema();
    init_accounts();
    init_connection();
    init_sync();
    init_mappers();
  }
});

// src/core/mail/spam.ts
function tokenize(text2) {
  return Array.from(new Set(text2.toLowerCase().match(/[a-z0-9@._'-]{3,}/g) ?? []));
}
function senderKind(accountId, email) {
  if (!email) return null;
  const row = getDb().select().from(spamSenders).where((0, import_drizzle_orm6.and)((0, import_drizzle_orm6.eq)(spamSenders.accountId, accountId), (0, import_drizzle_orm6.eq)(spamSenders.email, email))).get();
  return row?.kind ?? null;
}
function isKnownSender(accountId, email, excludeId) {
  if (!email) return false;
  const row = getDb().select({ count: import_drizzle_orm6.sql`count(*)` }).from(messages).where(
    (0, import_drizzle_orm6.and)((0, import_drizzle_orm6.eq)(messages.accountId, accountId), (0, import_drizzle_orm6.eq)(messages.fromEmail, email), (0, import_drizzle_orm6.ne)(messages.id, excludeId))
  ).get();
  return Number(row?.count ?? 0) > 0;
}
function modelProbability(tokens) {
  const db2 = getDb();
  const totals = db2.select({
    spam: import_drizzle_orm6.sql`coalesce(sum(spam_count), 0)`,
    ham: import_drizzle_orm6.sql`coalesce(sum(ham_count), 0)`
  }).from(spamTokens).get() ?? { spam: 0, ham: 0 };
  const totalSpam = Number(totals.spam);
  const totalHam = Number(totals.ham);
  if (totalSpam + totalHam < 20) return { prob: 0.5, trained: false };
  let logSum = 0;
  for (const token of tokens) {
    const row = db2.select().from(spamTokens).where((0, import_drizzle_orm6.eq)(spamTokens.token, token)).get();
    const pSpam = ((row?.spamCount ?? 0) + 1) / (totalSpam + 2);
    const pHam = ((row?.hamCount ?? 0) + 1) / (totalHam + 2);
    logSum += Math.log(pSpam / pHam);
  }
  const prior = Math.log((totalSpam || 1) / (totalHam || 1));
  const odds = Math.exp(prior + logSum);
  return { prob: odds / (1 + odds), trained: true };
}
function assessMessage(row, bodyText) {
  const reasons = [];
  let score = 0;
  const email = (row.fromEmail ?? "").toLowerCase();
  const kind = senderKind(row.accountId, email);
  if (kind === "allow") return { score: 0, reasons: ["Trusted sender"] };
  if (kind === "block") {
    score += 80;
    reasons.push("Sender is blocked");
  }
  if (email && !isKnownSender(row.accountId, email, row.id)) {
    score += 8;
    reasons.push("First-time sender");
  }
  const subject = row.subject ?? "";
  const lower = subject.toLowerCase();
  let keywordHits = 0;
  for (const keyword of SPAM_KEYWORDS) {
    if (lower.includes(keyword)) {
      keywordHits += 1;
      reasons.push(`Subject mentions \u201C${keyword}\u201D`);
    }
  }
  if (keywordHits > 0) score += Math.min(36, keywordHits * 12);
  if (subject.length > 8 && subject === subject.toUpperCase() && /[A-Z]/.test(subject)) {
    score += 8;
    reasons.push("Subject is all caps");
  }
  if (!row.messageId) {
    score += 5;
    reasons.push("Missing Message-ID");
  }
  const tokens = tokenize(`${subject} ${email} ${bodyText ?? ""}`);
  const { prob, trained } = modelProbability(tokens);
  if (trained) {
    if (prob >= 0.9) {
      score += 40;
      reasons.push("Matches learned spam patterns");
    } else if (prob >= 0.7) {
      score += 18;
      reasons.push("Contains spam-like wording");
    } else if (prob <= 0.1) {
      score -= 10;
      reasons.push("Matches your good mail");
    }
  }
  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, reasons: reasons.length ? reasons : ["No spam signals found"] };
}
function applyAssessment(messageId) {
  const db2 = getDb();
  const row = db2.select().from(messages).where((0, import_drizzle_orm6.eq)(messages.id, messageId)).get();
  if (!row) return 0;
  const body = db2.select().from(messageBodies).where((0, import_drizzle_orm6.eq)(messageBodies.messageId, messageId)).get();
  const { score, reasons } = assessMessage(row, body?.textPlain ?? null);
  db2.update(messages).set({ spamScore: score, spamReasons: JSON.stringify(reasons), isSpam: score >= AUTO_SPAM_THRESHOLD }).where((0, import_drizzle_orm6.eq)(messages.id, messageId)).run();
  return score;
}
function train(messageId, asSpam) {
  const db2 = getDb();
  const row = db2.select().from(messages).where((0, import_drizzle_orm6.eq)(messages.id, messageId)).get();
  if (!row) return;
  const body = db2.select().from(messageBodies).where((0, import_drizzle_orm6.eq)(messageBodies.messageId, messageId)).get();
  const tokens = tokenize(`${row.subject ?? ""} ${row.fromEmail ?? ""} ${body?.textPlain ?? ""}`);
  for (const token of tokens) {
    db2.insert(spamTokens).values({ token, spamCount: asSpam ? 1 : 0, hamCount: asSpam ? 0 : 1 }).onConflictDoUpdate({
      target: spamTokens.token,
      set: asSpam ? { spamCount: import_drizzle_orm6.sql`${spamTokens.spamCount} + 1` } : { hamCount: import_drizzle_orm6.sql`${spamTokens.hamCount} + 1` }
    }).run();
  }
}
function markSpam(messageId) {
  getDb().update(messages).set({ isSpam: true, spamScore: 100, spamReasons: JSON.stringify(["Marked as spam by you"]) }).where((0, import_drizzle_orm6.eq)(messages.id, messageId)).run();
  train(messageId, true);
}
function markNotSpam(messageId) {
  getDb().update(messages).set({ isSpam: false, spamScore: 0, spamReasons: JSON.stringify(["Marked as not spam by you"]) }).where((0, import_drizzle_orm6.eq)(messages.id, messageId)).run();
  train(messageId, false);
}
function setSenderKind(accountId, email, kind) {
  const db2 = getDb();
  const normalized = email.toLowerCase();
  if (!kind) {
    db2.delete(spamSenders).where((0, import_drizzle_orm6.and)((0, import_drizzle_orm6.eq)(spamSenders.accountId, accountId), (0, import_drizzle_orm6.eq)(spamSenders.email, normalized))).run();
    return;
  }
  const existing = db2.select().from(spamSenders).where((0, import_drizzle_orm6.and)((0, import_drizzle_orm6.eq)(spamSenders.accountId, accountId), (0, import_drizzle_orm6.eq)(spamSenders.email, normalized))).get();
  if (existing) {
    db2.update(spamSenders).set({ kind }).where((0, import_drizzle_orm6.eq)(spamSenders.id, existing.id)).run();
  } else {
    db2.insert(spamSenders).values({ id: (0, import_node_crypto2.randomUUID)(), accountId, email: normalized, kind, createdAt: Date.now() }).run();
  }
}
function listSpam(accountId) {
  return getDb().select().from(messages).where((0, import_drizzle_orm6.and)((0, import_drizzle_orm6.eq)(messages.accountId, accountId), (0, import_drizzle_orm6.eq)(messages.isSpam, true))).orderBy((0, import_drizzle_orm6.desc)(messages.dateUtc)).all();
}
function countSpam(accountId) {
  const row = getDb().select({ count: import_drizzle_orm6.sql`count(*)` }).from(messages).where((0, import_drizzle_orm6.and)((0, import_drizzle_orm6.eq)(messages.accountId, accountId), (0, import_drizzle_orm6.eq)(messages.isSpam, true))).get();
  return Number(row?.count ?? 0);
}
var import_node_crypto2, import_drizzle_orm6, AUTO_SPAM_THRESHOLD, SPAM_KEYWORDS;
var init_spam = __esm({
  "src/core/mail/spam.ts"() {
    "use strict";
    import_node_crypto2 = require("node:crypto");
    import_drizzle_orm6 = require("drizzle-orm");
    init_db();
    init_schema();
    AUTO_SPAM_THRESHOLD = 60;
    SPAM_KEYWORDS = [
      "viagra",
      "cialis",
      "lottery",
      "you won",
      "you have won",
      "winner",
      "free money",
      "risk-free",
      "wire transfer",
      "bitcoin",
      "crypto giveaway",
      "act now",
      "limited time",
      "click here to claim",
      "unclaimed",
      "inheritance",
      "pre-approved",
      "make money fast",
      "work from home",
      "urgent business proposal"
    ];
  }
});

// src/core/mail/storeMessage.ts
function addressJson(value) {
  if (!value) return null;
  const list = Array.isArray(value) ? value : value.value;
  if (!list || list.length === 0) return null;
  return JSON.stringify(
    list.map((a) => ({
      name: a.name ?? null,
      address: a.address ?? null
    }))
  );
}
function ensureInboxFolder(accountId) {
  const db2 = getDb();
  const existing = db2.select().from(folders).where((0, import_drizzle_orm7.and)((0, import_drizzle_orm7.eq)(folders.accountId, accountId), (0, import_drizzle_orm7.eq)(folders.specialUse, "inbox"))).get();
  if (existing) return existing.id;
  const id = (0, import_node_crypto3.randomUUID)();
  db2.insert(folders).values({
    id,
    accountId,
    remotePath: "INBOX",
    name: "Inbox",
    specialUse: "inbox",
    sortOrder: 0,
    isSubscribed: true,
    isVisible: true
  }).run();
  return id;
}
function ensureFolder(accountId, name) {
  const db2 = getDb();
  const existing = db2.select().from(folders).where((0, import_drizzle_orm7.and)((0, import_drizzle_orm7.eq)(folders.accountId, accountId), (0, import_drizzle_orm7.eq)(folders.name, name))).get();
  if (existing) return existing.id;
  const id = (0, import_node_crypto3.randomUUID)();
  db2.insert(folders).values({
    id,
    accountId,
    remotePath: name,
    name,
    specialUse: null,
    sortOrder: 100,
    isSubscribed: true,
    isVisible: true
  }).run();
  return id;
}
function resolveThreadId(accountId, id, messageId, inReplyTo) {
  if (inReplyTo) {
    const parent = getDb().select().from(messages).where((0, import_drizzle_orm7.and)((0, import_drizzle_orm7.eq)(messages.accountId, accountId), (0, import_drizzle_orm7.eq)(messages.messageId, inReplyTo))).get();
    if (parent?.threadId) return parent.threadId;
    return inReplyTo;
  }
  return messageId ?? id;
}
function storeParsedMessage(accountId, folderId, uid, parsed, source, options = {}) {
  const db2 = getDb();
  const id = `${folderId}:${uid}`;
  const from = parsed.from?.value?.[0];
  const textPlain = typeof parsed.text === "string" ? parsed.text : null;
  const htmlRaw = typeof parsed.html === "string" ? parsed.html : null;
  const snippet = (textPlain ?? "").replace(/\s+/g, " ").trim().slice(0, 240) || null;
  const threadId = resolveThreadId(accountId, id, parsed.messageId ?? null, parsed.inReplyTo ?? null);
  db2.insert(messages).values({
    id,
    accountId,
    folderId,
    uid,
    messageId: parsed.messageId ?? null,
    inReplyTo: parsed.inReplyTo ?? null,
    refs: null,
    subject: parsed.subject ?? null,
    fromName: from?.name ?? null,
    fromEmail: from?.address ?? null,
    toJson: addressJson(parsed.to),
    ccJson: addressJson(parsed.cc),
    bccJson: addressJson(parsed.bcc),
    replyToJson: addressJson(parsed.replyTo),
    dateUtc: parsed.date ? parsed.date.getTime() : null,
    internalDate: Date.now(),
    size: source.length,
    isRead: !options.unread,
    hasAttachments: parsed.attachments.length > 0,
    snippet,
    threadId,
    pop3Uidl: options.pop3Uidl ?? null
  }).onConflictDoNothing().run();
  db2.insert(messageBodies).values({ messageId: id, textPlain, htmlRaw, fetchedAt: Date.now() }).onConflictDoUpdate({
    target: messageBodies.messageId,
    set: { textPlain, htmlRaw, fetchedAt: Date.now() }
  }).run();
  db2.delete(attachments).where((0, import_drizzle_orm7.eq)(attachments.messageId, id)).run();
  for (const att of parsed.attachments) {
    const attId = (0, import_node_crypto3.randomUUID)();
    let contentPath = null;
    if (att.content && Buffer.isBuffer(att.content)) {
      try {
        contentPath = saveAttachment(id, attId, att.filename ?? null, att.content);
      } catch {
        contentPath = null;
      }
    }
    db2.insert(attachments).values({
      id: attId,
      messageId: id,
      filename: att.filename ?? null,
      mimeType: att.contentType ?? null,
      size: typeof att.size === "number" ? att.size : null,
      contentId: att.cid ? att.cid.replace(/^<|>$/g, "") : null,
      isInline: att.contentDisposition === "inline" || Boolean(att.cid),
      contentPath
    }).run();
  }
  indexMessage(id);
  if (options.assessSpam !== false) applyAssessment(id);
  return id;
}
function clearSentPlaceholder(accountId, folderId, messageId) {
  if (!messageId) return false;
  const db2 = getDb();
  const placeholder = db2.select().from(messages).where(
    (0, import_drizzle_orm7.and)(
      (0, import_drizzle_orm7.eq)(messages.accountId, accountId),
      (0, import_drizzle_orm7.eq)(messages.folderId, folderId),
      (0, import_drizzle_orm7.eq)(messages.messageId, messageId),
      (0, import_drizzle_orm7.lt)(messages.uid, 0)
    )
  ).get();
  if (!placeholder) return false;
  db2.delete(messages).where((0, import_drizzle_orm7.eq)(messages.id, placeholder.id)).run();
  removeFromIndex(placeholder.id);
  return true;
}
function nextUidForFolder(folderId) {
  const rows = getDb().select({ uid: messages.uid }).from(messages).where((0, import_drizzle_orm7.eq)(messages.folderId, folderId)).all();
  return rows.reduce((max, row) => Math.max(max, row.uid), 0) + 1;
}
var import_node_crypto3, import_drizzle_orm7;
var init_storeMessage = __esm({
  "src/core/mail/storeMessage.ts"() {
    "use strict";
    import_node_crypto3 = require("node:crypto");
    import_drizzle_orm7 = require("drizzle-orm");
    init_db();
    init_schema();
    init_search();
    init_spam();
    init_storage();
  }
});

// src/core/mail/pop3.ts
async function testPop3(settings, auth) {
  if (!auth.pass) throw new Error("POP3 requires a password");
  const client = new Pop3Client();
  await client.connect(settings);
  try {
    await client.login(auth.user, auth.pass);
    await client.stat();
    return "POP3 connection succeeded";
  } finally {
    await client.quit().catch(() => void 0);
  }
}
async function fetchPop3(accountId, emit) {
  const account = getAccountById(accountId);
  if (!account) throw new Error("Account not found");
  const auth = await getAccountAuth(accountId);
  if (!auth?.pass) throw new Error("POP3 accounts need a password (OAuth is not supported).");
  emit({ type: "sync:start", accountId });
  const client = new Pop3Client();
  await client.connect(account.incoming);
  const folderId = ensureInboxFolder(accountId);
  let fetched = 0;
  try {
    await client.login(account.incoming.username, auth.pass);
    const db2 = getDb();
    const seen = new Set(
      db2.select({ uidl: messages.pop3Uidl }).from(messages).where((0, import_drizzle_orm8.and)((0, import_drizzle_orm8.eq)(messages.accountId, accountId), (0, import_drizzle_orm8.isNotNull)(messages.pop3Uidl))).all().map((row) => row.uidl)
    );
    let uid = nextUidForFolder(folderId);
    const remote = await client.uidl();
    for (const item of remote) {
      if (seen.has(item.uidl)) continue;
      const source = await client.retr(item.num);
      const parsed = await (0, import_mailparser.simpleParser)(source);
      storeParsedMessage(accountId, folderId, uid, parsed, source, {
        pop3Uidl: item.uidl,
        unread: true
      });
      uid += 1;
      fetched += 1;
      emit({
        type: "sync:progress",
        accountId,
        folderId,
        folderName: "Inbox",
        fetched
      });
    }
    const folder = db2.select().from(folders).where((0, import_drizzle_orm8.eq)(folders.id, folderId)).get();
    if (folder) {
      const total = db2.select().from(messages).where((0, import_drizzle_orm8.eq)(messages.folderId, folderId)).all().length;
      db2.update(folders).set({ totalCount: total, unreadCount: total }).where((0, import_drizzle_orm8.eq)(folders.id, folderId)).run();
    }
  } finally {
    await client.quit().catch(() => void 0);
  }
  emit({ type: "sync:done", accountId, fetched });
  return { folders: 1, fetched };
}
var import_node_net, import_node_tls, import_mailparser, import_drizzle_orm8, LineReader, Pop3Client;
var init_pop3 = __esm({
  "src/core/mail/pop3.ts"() {
    "use strict";
    import_node_net = __toESM(require("node:net"));
    import_node_tls = __toESM(require("node:tls"));
    import_mailparser = require("mailparser");
    import_drizzle_orm8 = require("drizzle-orm");
    init_db();
    init_schema();
    init_accounts();
    init_auth();
    init_storeMessage();
    LineReader = class {
      lines = [];
      resolvers = [];
      push(line) {
        const resolver = this.resolvers.shift();
        if (resolver) resolver(line);
        else this.lines.push(line);
      }
      read() {
        const buffered = this.lines.shift();
        if (buffered !== void 0) return Promise.resolve(buffered);
        return new Promise((resolve) => this.resolvers.push(resolve));
      }
    };
    Pop3Client = class {
      socket = null;
      reader = new LineReader();
      leftover = "";
      connect(settings) {
        return new Promise((resolve, reject) => {
          const onReady = () => {
            void this.reader.read().then((greeting) => {
              if (!greeting.startsWith("+OK")) {
                reject(new Error("POP3 server refused the connection"));
                return;
              }
              resolve();
            }).catch(reject);
          };
          const secure = settings.security === "ssl";
          this.socket = secure ? import_node_tls.default.connect(
            { host: settings.host, port: settings.port, rejectUnauthorized: settings.security !== "none" },
            onReady
          ) : import_node_net.default.connect({ host: settings.host, port: settings.port }, onReady);
          this.socket.on("data", (chunk) => this.feed(chunk));
          this.socket.on("error", (error) => reject(error));
        });
      }
      feed(chunk) {
        this.leftover += chunk.toString("utf8");
        let index2;
        while ((index2 = this.leftover.indexOf("\n")) >= 0) {
          let line = this.leftover.slice(0, index2);
          this.leftover = this.leftover.slice(index2 + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          this.reader.push(line);
        }
      }
      async command(line) {
        if (!this.socket) throw new Error("Not connected");
        this.socket.write(`${line}\r
`);
        const response = await this.reader.read();
        if (!response.startsWith("+OK")) {
          throw new Error(response.replace(/^-ERR\s*/i, "").trim() || "POP3 command failed");
        }
        return response;
      }
      async commandMultiline(line) {
        await this.command(line);
        const out = [];
        for (; ; ) {
          const next = await this.reader.read();
          if (next === ".") break;
          out.push(next.startsWith("..") ? next.slice(1) : next);
        }
        return out;
      }
      async login(user, pass) {
        await this.command(`USER ${user}`);
        await this.command(`PASS ${pass}`);
      }
      async stat() {
        const response = await this.command("STAT");
        const count = Number(response.split(/\s+/)[1] ?? "0");
        return Number.isFinite(count) ? count : 0;
      }
      async uidl() {
        const lines = await this.commandMultiline("UIDL");
        return lines.map((line) => {
          const [num, uidl] = line.trim().split(/\s+/);
          return { num: Number(num), uidl };
        }).filter((item) => Number.isFinite(item.num) && item.uidl);
      }
      async retr(num) {
        const lines = await this.commandMultiline(`RETR ${num}`);
        return Buffer.from(lines.join("\r\n"), "utf8");
      }
      async dele(num) {
        await this.command(`DELE ${num}`);
      }
      async quit() {
        try {
          await this.command("QUIT");
        } catch {
        }
        this.socket?.end();
      }
      close() {
        this.socket?.destroy();
      }
    };
  }
});

// src/core/log.ts
function logLine(scope, message) {
  if (!logFile) return;
  try {
    if ((0, import_node_fs3.existsSync)(logFile) && (0, import_node_fs3.statSync)(logFile).size > MAX_BYTES) {
      (0, import_node_fs3.renameSync)(logFile, `${logFile}.1`);
    }
    (0, import_node_fs3.appendFileSync)(logFile, `[${(/* @__PURE__ */ new Date()).toISOString()}] [${scope}] ${message}
`);
  } catch {
  }
}
function logError(scope, error) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  logLine(scope, message);
}
var import_node_fs3, MAX_BYTES, logFile;
var init_log = __esm({
  "src/core/log.ts"() {
    "use strict";
    import_node_fs3 = require("node:fs");
    MAX_BYTES = 1e6;
    logFile = "";
  }
});

// src/core/mail/reconcile.ts
async function reconcileMailbox(client, accountId, folderId, folderRow, messagesCount, uidNext) {
  const db2 = getDb();
  if (!folderRow.reconcileSuspect && folderRow.lastMessages === messagesCount && folderRow.lastUidNext === uidNext) {
    return { status: "skipped", gaps: [] };
  }
  const local = db2.select({ id: messages.id, uid: messages.uid }).from(messages).where((0, import_drizzle_orm9.and)((0, import_drizzle_orm9.eq)(messages.accountId, accountId), (0, import_drizzle_orm9.eq)(messages.folderId, folderId))).all();
  const cached = local.filter((row) => row.uid > 0);
  if (cached.length === 0) return { status: "skipped", gaps: [] };
  let min = Infinity;
  let max = -Infinity;
  for (const row of cached) {
    if (row.uid < min) min = row.uid;
    if (row.uid > max) max = row.uid;
  }
  let serverUids;
  try {
    const found = await client.search({ uid: `${min}:${max}` }, { uid: true });
    if (!Array.isArray(found)) {
      logLine("reconcile", `${folderRow.remotePath}: failed (no UID list)`);
      return { status: "failed", gaps: [] };
    }
    serverUids = found;
  } catch (error) {
    logLine("reconcile", `${folderRow.remotePath}: failed (${error instanceof Error ? error.message : String(error)})`);
    return { status: "failed", gaps: [] };
  }
  const serverSet = new Set(serverUids);
  const localSet = new Set(cached.map((row) => row.uid));
  const gaps = serverUids.filter((uid) => !localSet.has(uid));
  const missing = cached.filter((row) => !serverSet.has(row.uid));
  if (missing.length === 0) {
    if (folderRow.reconcileSuspect) {
      db2.update(folders).set({ reconcileSuspect: false }).where((0, import_drizzle_orm9.eq)(folders.id, folderId)).run();
    }
    return { status: "ok", gaps };
  }
  const suspicious = missing.length > 20 && missing.length > cached.length / 2 || missing.length === cached.length && cached.length > 1;
  if (suspicious && !folderRow.reconcileSuspect) {
    db2.update(folders).set({ reconcileSuspect: true }).where((0, import_drizzle_orm9.eq)(folders.id, folderId)).run();
    logLine("reconcile", `${folderRow.remotePath}: suspect (${missing.length}/${cached.length} missing)`);
    return { status: "suspect", gaps: [] };
  }
  if (RECONCILE_DRYRUN) {
    const detail = `would remove ${missing.length}/${cached.length} from ${folderRow.remotePath}: uids ${missing.map((row) => row.uid).join(",")}`;
    logLine("reconcile", `dryrun: ${detail}`);
    console.log(`[reconcile] ${detail}`);
    return { status: "dryrun", gaps: [] };
  }
  const removedIds = missing.map((row) => row.id);
  db2.transaction((tx) => {
    for (const id of removedIds) tx.delete(messages).where((0, import_drizzle_orm9.eq)(messages.id, id)).run();
  });
  for (const id of removedIds) removeFromIndex(id);
  db2.update(folders).set({ reconcileSuspect: false }).where((0, import_drizzle_orm9.eq)(folders.id, folderId)).run();
  logLine("reconcile", `${folderRow.remotePath}: removed ${removedIds.length}`);
  return { status: "ok", gaps };
}
var import_drizzle_orm9, RECONCILE_DRYRUN;
var init_reconcile = __esm({
  "src/core/mail/reconcile.ts"() {
    "use strict";
    import_drizzle_orm9 = require("drizzle-orm");
    init_db();
    init_schema();
    init_search();
    init_log();
    RECONCILE_DRYRUN = process.env.CLOVER_RECONCILE_DRYRUN === "1";
  }
});

// src/core/mail/threadSettings.ts
function listThreadFlags() {
  const map = /* @__PURE__ */ new Map();
  for (const row of getDb().select().from(threadSettings).all()) {
    map.set(row.threadId, { muted: row.muted, pinned: row.pinned });
  }
  return map;
}
function upsert(threadId, patch) {
  const db2 = getDb();
  const existing = db2.select().from(threadSettings).where((0, import_drizzle_orm10.eq)(threadSettings.threadId, threadId)).get();
  if (existing) {
    db2.update(threadSettings).set(patch).where((0, import_drizzle_orm10.eq)(threadSettings.threadId, threadId)).run();
  } else {
    db2.insert(threadSettings).values({
      threadId,
      muted: patch.muted ?? false,
      pinned: patch.pinned ?? false
    }).run();
  }
}
function setThreadMuted(threadId, muted) {
  upsert(threadId, { muted });
}
function setThreadPinned(threadId, pinned) {
  upsert(threadId, { pinned });
}
function isThreadMuted(threadId) {
  if (!threadId) return false;
  const row = getDb().select().from(threadSettings).where((0, import_drizzle_orm10.eq)(threadSettings.threadId, threadId)).get();
  return row?.muted ?? false;
}
var import_drizzle_orm10;
var init_threadSettings = __esm({
  "src/core/mail/threadSettings.ts"() {
    "use strict";
    import_drizzle_orm10 = require("drizzle-orm");
    init_db();
    init_schema();
  }
});

// src/core/mail/recentUids.ts
function key(accountId, folderId) {
  return `${accountId}\0${folderId}`;
}
function mark(map, accountId, folderId, uids) {
  if (uids.length === 0) return;
  const k = key(accountId, folderId);
  const entry = map.get(k) ?? { uids: /* @__PURE__ */ new Set(), at: Date.now() };
  for (const uid of uids) entry.uids.add(uid);
  entry.at = Date.now();
  map.set(k, entry);
}
function has(map, accountId, folderId, uid) {
  const k = key(accountId, folderId);
  const entry = map.get(k);
  if (!entry) return false;
  if (Date.now() - entry.at > TTL_MS) {
    map.delete(k);
    return false;
  }
  return entry.uids.has(uid);
}
function markRecentlyRestored(accountId, folderId, uids) {
  mark(restored, accountId, folderId, uids);
}
function isRecentlyRestored(accountId, folderId, uid) {
  return has(restored, accountId, folderId, uid);
}
function markRecentlyRemoved(accountId, folderId, uids) {
  mark(removed, accountId, folderId, uids);
}
function isRecentlyRemoved(accountId, folderId, uid) {
  return has(removed, accountId, folderId, uid);
}
var TTL_MS, restored, removed;
var init_recentUids = __esm({
  "src/core/mail/recentUids.ts"() {
    "use strict";
    TTL_MS = 10 * 6e4;
    restored = /* @__PURE__ */ new Map();
    removed = /* @__PURE__ */ new Map();
  }
});

// src/core/mail/announce.ts
function announceNewInboxMessages(accountId, folderId, insertedUids) {
  if (insertedUids.length === 0) return null;
  const db2 = getDb();
  const ids = insertedUids.map((uid) => `${folderId}:${uid}`);
  const rows = db2.select().from(messages).where((0, import_drizzle_orm11.and)((0, import_drizzle_orm11.eq)(messages.accountId, accountId), (0, import_drizzle_orm11.inArray)(messages.id, ids))).all();
  const candidates = rows.filter(
    (row) => !row.isRead && !row.isSpam && !isRecentlyRestored(accountId, folderId, row.uid) && !isThreadMuted(row.threadId)
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (b.dateUtc ?? 0) - (a.dateUtc ?? 0));
  const newest = candidates[0];
  return {
    type: "mail:new",
    accountId,
    messageId: newest.id,
    threadId: newest.threadId ?? void 0,
    title: newest.fromName || newest.fromEmail || "New mail",
    body: candidates.length > 1 ? `and ${candidates.length - 1} more` : newest.subject ?? ""
  };
}
var import_drizzle_orm11;
var init_announce = __esm({
  "src/core/mail/announce.ts"() {
    "use strict";
    import_drizzle_orm11 = require("drizzle-orm");
    init_db();
    init_schema();
    init_threadSettings();
    init_recentUids();
  }
});

// src/core/mail/specialUse.ts
function inferSpecialUse(remotePath, name) {
  const last = (remotePath.split(/[\\/]/).pop() ?? remotePath).trim().toLowerCase();
  const label = (name ?? "").trim().toLowerCase();
  const candidates = [last, label];
  const has2 = (set) => candidates.some((c) => set.includes(c));
  if (has2(SENT_NAMES)) return "sent";
  if (has2(DRAFT_NAMES)) return "drafts";
  if (has2(TRASH_NAMES)) return "trash";
  if (has2(JUNK_NAMES)) return "junk";
  if (has2(ARCHIVE_NAMES)) return "archive";
  return null;
}
var SPECIAL_USE_ORDER, SENT_NAMES, DRAFT_NAMES, TRASH_NAMES, JUNK_NAMES, ARCHIVE_NAMES;
var init_specialUse = __esm({
  "src/core/mail/specialUse.ts"() {
    "use strict";
    SPECIAL_USE_ORDER = {
      inbox: 0,
      drafts: 1,
      sent: 2,
      archive: 3,
      junk: 4,
      trash: 5
    };
    SENT_NAMES = ["sent", "sent mail", "sent items", "sent messages", "outbox"];
    DRAFT_NAMES = ["draft", "drafts"];
    TRASH_NAMES = ["trash", "deleted items", "deleted messages", "bin", "deleted"];
    JUNK_NAMES = ["junk", "spam", "junk mail", "junk e-mail", "bulk mail"];
    ARCHIVE_NAMES = ["archive", "all mail", "all"];
  }
});

// src/core/mail/queries.ts
function notSnoozed() {
  return (0, import_drizzle_orm12.or)((0, import_drizzle_orm12.isNull)(messages.snoozedUntil), (0, import_drizzle_orm12.lt)(messages.snoozedUntil, Date.now()));
}
function listFolders(accountId) {
  const db2 = getDb();
  const rows = db2.select().from(folders).where((0, import_drizzle_orm12.eq)(folders.accountId, accountId)).all();
  const unread = db2.select({ folderId: messages.folderId, count: import_drizzle_orm12.sql`count(*)` }).from(messages).where(
    (0, import_drizzle_orm12.and)((0, import_drizzle_orm12.eq)(messages.accountId, accountId), (0, import_drizzle_orm12.eq)(messages.isRead, false), (0, import_drizzle_orm12.ne)(messages.isSpam, true))
  ).groupBy(messages.folderId).all();
  const unreadMap = new Map(unread.map((u) => [u.folderId, Number(u.count)]));
  return rows.filter((row) => row.remotePath !== "[Gmail]" && row.name !== "[Gmail]").sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)).map((row) => ({
    id: row.id,
    accountId: row.accountId,
    remotePath: row.remotePath,
    name: row.name,
    specialUse: row.specialUse,
    unreadCount: unreadMap.get(row.id) ?? 0,
    totalCount: row.totalCount,
    sortOrder: row.sortOrder,
    isVisible: row.isVisible
  }));
}
function listMessages(folderId, limit = 150, offset = 0) {
  const db2 = getDb();
  const folderRow = db2.select().from(folders).where((0, import_drizzle_orm12.eq)(folders.id, folderId)).get();
  const role = folderRow?.specialUse ?? (folderRow ? inferSpecialUse(folderRow.remotePath, folderRow.name) : null);
  const conditions = [(0, import_drizzle_orm12.eq)(messages.folderId, folderId), (0, import_drizzle_orm12.ne)(messages.isSpam, true), notSnoozed()];
  if (role === "drafts") conditions.push((0, import_drizzle_orm12.eq)(messages.isDraft, true));
  return db2.select().from(messages).where((0, import_drizzle_orm12.and)(...conditions)).orderBy((0, import_drizzle_orm12.desc)(messages.dateUtc), (0, import_drizzle_orm12.desc)(messages.uid)).limit(limit).offset(offset).all().map(toMessageSummary);
}
function listJunk(accountId) {
  return listSpam(accountId).map(toMessageSummary);
}
function spamCount(accountId) {
  return countSpam(accountId);
}
function normalizeSubject(subject) {
  if (!subject) return "";
  return subject.replace(/^\s*(?:(?:re|fwd|fw|aw|sv|vs)\s*(?:\[\d+\])?\s*:\s*)+/i, "").replace(/\s+/g, " ").trim().toLowerCase();
}
function isTrashOrJunk(folder) {
  if (!folder) return false;
  const role = folder.specialUse ?? inferSpecialUse(folder.remotePath, folder.name);
  return role === "trash" || role === "junk";
}
function copyRank(folder, viewed) {
  if (folder && folder.id === viewed) return 0;
  if (isTrashOrJunk(folder)) return 100;
  const role = folder ? folder.specialUse ?? inferSpecialUse(folder.remotePath, folder.name) : null;
  if (role === "inbox") return 1;
  if (role === "sent") return 2;
  if (role === "drafts") return 3;
  if ((folder?.name ?? "").toLowerCase() === "important") return 5;
  if (role === "archive") return 6;
  return 4;
}
function dedupeCopies(rows, foldersById2, viewed) {
  const best = /* @__PURE__ */ new Map();
  for (const row of rows) {
    if (!row.messageId) continue;
    const current = best.get(row.messageId);
    if (!current || copyRank(foldersById2.get(row.folderId), viewed) < copyRank(foldersById2.get(current.folderId), viewed)) {
      best.set(row.messageId, row);
    }
  }
  return rows.filter((row) => {
    if (!row.messageId) return true;
    if (row.folderId !== viewed && isTrashOrJunk(foldersById2.get(row.folderId))) return false;
    return best.get(row.messageId) === row;
  });
}
function foldersById(accountId) {
  const db2 = getDb();
  const rows = accountId ? db2.select().from(folders).where((0, import_drizzle_orm12.eq)(folders.accountId, accountId)).all() : db2.select().from(folders).all();
  return new Map(rows.map((f) => [f.id, f]));
}
function buildThreads(input, foldersMap, viewed) {
  const rows = dedupeCopies(input, foldersMap, viewed);
  const parent = /* @__PURE__ */ new Map();
  const find = (x) => {
    let root2 = parent.get(x) ?? x;
    if (root2 !== x) {
      root2 = find(root2);
      parent.set(x, root2);
    }
    return root2;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const row of rows) parent.set(row.id, row.id);
  const byThread = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const key2 = row.threadId ?? row.id;
    const first = byThread.get(key2);
    if (first) union(row.id, first);
    else byThread.set(key2, row.id);
  }
  const bySubject = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const key2 = normalizeSubject(row.subject);
    if (!key2) continue;
    const first = bySubject.get(key2);
    if (first) union(row.id, first);
    else bySubject.set(key2, row.id);
  }
  const groups = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const root2 = find(row.id);
    const list = groups.get(root2) ?? [];
    list.push(row);
    groups.set(root2, list);
  }
  const threads = [];
  for (const [root2, list] of groups) {
    const ordered = [...list].sort((a, b) => (a.dateUtc ?? 0) - (b.dateUtc ?? 0));
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    threads.push({
      threadId: root2,
      subject: first.subject,
      fromName: last.fromName,
      fromEmail: last.fromEmail,
      messageCount: ordered.length,
      unreadCount: ordered.filter((m) => !m.isRead).length,
      hasAttachments: ordered.some((m) => m.hasAttachments),
      isImportant: ordered.some((m) => m.isImportant),
      muted: false,
      pinned: false,
      lastDate: last.dateUtc,
      messages: ordered.map(toMessageSummary)
    });
  }
  const flags = listThreadFlags();
  for (const thread of threads) {
    const flag = flags.get(thread.threadId);
    thread.muted = flag?.muted ?? false;
    thread.pinned = flag?.pinned ?? false;
  }
  return threads.sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || (b.lastDate ?? 0) - (a.lastDate ?? 0)
  );
}
function listThreads(folderId, limit = 1500) {
  const db2 = getDb();
  const folderRow = db2.select().from(folders).where((0, import_drizzle_orm12.eq)(folders.id, folderId)).get();
  if (!folderRow) return [];
  const rows = db2.select().from(messages).where((0, import_drizzle_orm12.and)((0, import_drizzle_orm12.eq)(messages.accountId, folderRow.accountId), (0, import_drizzle_orm12.ne)(messages.isSpam, true), notSnoozed())).orderBy((0, import_drizzle_orm12.desc)(messages.dateUtc)).limit(limit * COPY_HEADROOM).all();
  return buildThreads(rows, foldersById(folderRow.accountId), folderId).filter(
    (t) => t.messages.some((m) => m.folderId === folderId)
  );
}
function messageStatuses(ids) {
  const db2 = getDb();
  const out = {};
  for (const id of ids) {
    const row = db2.select({ isRead: messages.isRead }).from(messages).where((0, import_drizzle_orm12.eq)(messages.id, id)).get();
    out[id] = { exists: Boolean(row), isRead: row?.isRead ?? false };
  }
  return out;
}
function hasOlderMessages(folderId, limit) {
  const db2 = getDb();
  const folderRow = db2.select().from(folders).where((0, import_drizzle_orm12.eq)(folders.id, folderId)).get();
  if (!folderRow) return false;
  const rows = db2.select({ id: messages.id }).from(messages).where((0, import_drizzle_orm12.and)((0, import_drizzle_orm12.eq)(messages.accountId, folderRow.accountId), (0, import_drizzle_orm12.ne)(messages.isSpam, true), notSnoozed())).orderBy((0, import_drizzle_orm12.desc)(messages.dateUtc)).limit(limit + 1).all();
  return rows.length > limit;
}
function findThreadRows(messageId, limit) {
  const db2 = getDb();
  const row = db2.select().from(messages).where((0, import_drizzle_orm12.eq)(messages.id, messageId)).get();
  if (!row) return [];
  const rows = db2.select().from(messages).where((0, import_drizzle_orm12.and)((0, import_drizzle_orm12.eq)(messages.accountId, row.accountId), (0, import_drizzle_orm12.ne)(messages.isSpam, true), notSnoozed())).orderBy((0, import_drizzle_orm12.desc)(messages.dateUtc)).limit(limit * COPY_HEADROOM).all();
  const thread = buildThreads(rows, foldersById(row.accountId), row.folderId).find(
    (t) => t.messages.some((m) => m.id === messageId)
  );
  if (!thread) return [row];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return thread.messages.map((m) => byId.get(m.id)).filter((r) => Boolean(r));
}
function threadMessageIds(messageId, limit = 1500) {
  return findThreadRows(messageId, limit).map((r) => r.id);
}
function parseAddressList(json) {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function threadParticipants(messageId, limit = 1500) {
  const rows = findThreadRows(messageId, limit);
  if (rows.length === 0) return [];
  const db2 = getDb();
  const accountId = rows[0].accountId;
  const self = /* @__PURE__ */ new Set();
  const account = db2.select({ email: accounts.email }).from(accounts).where((0, import_drizzle_orm12.eq)(accounts.id, accountId)).get();
  if (account?.email) self.add(account.email.trim().toLowerCase());
  for (const alias of db2.select({ email: accountAliases.email }).from(accountAliases).where((0, import_drizzle_orm12.eq)(accountAliases.accountId, accountId)).all()) {
    if (alias.email) self.add(alias.email.trim().toLowerCase());
  }
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  const add = (name, address) => {
    const addr = (address ?? "").trim();
    if (!addr) return;
    const key2 = addr.toLowerCase();
    if (self.has(key2) || seen.has(key2)) return;
    seen.add(key2);
    out.push(name ? `${name} <${addr}>` : addr);
  };
  for (const row of rows) {
    add(row.fromName, row.fromEmail);
    for (const a of parseAddressList(row.toJson)) add(a.name, a.address);
    for (const a of parseAddressList(row.ccJson)) add(a.name, a.address);
  }
  return out;
}
function listUnifiedThreads(limit = 300) {
  const rows = getDb().select().from(messages).where((0, import_drizzle_orm12.and)((0, import_drizzle_orm12.ne)(messages.isSpam, true), notSnoozed())).orderBy((0, import_drizzle_orm12.desc)(messages.dateUtc)).limit(limit * COPY_HEADROOM).all();
  return buildThreads(rows, foldersById(), null);
}
function listUnifiedMessages(limit = 300) {
  return getDb().select().from(messages).where((0, import_drizzle_orm12.and)((0, import_drizzle_orm12.ne)(messages.isSpam, true), notSnoozed())).orderBy((0, import_drizzle_orm12.desc)(messages.dateUtc)).limit(limit).all().map(toMessageSummary);
}
function listImportant(accountId) {
  return getDb().select().from(messages).where((0, import_drizzle_orm12.and)((0, import_drizzle_orm12.eq)(messages.accountId, accountId), (0, import_drizzle_orm12.eq)(messages.isImportant, true), notSnoozed())).orderBy((0, import_drizzle_orm12.desc)(messages.dateUtc)).all().map(toMessageSummary);
}
function importantCount(accountId) {
  const row = getDb().select({ count: import_drizzle_orm12.sql`count(*)` }).from(messages).where((0, import_drizzle_orm12.and)((0, import_drizzle_orm12.eq)(messages.accountId, accountId), (0, import_drizzle_orm12.eq)(messages.isImportant, true))).get();
  return Number(row?.count ?? 0);
}
function allFoldersSorted(accountId) {
  return getDb().select().from(folders).where((0, import_drizzle_orm12.eq)(folders.accountId, accountId)).orderBy((0, import_drizzle_orm12.asc)(folders.sortOrder)).all();
}
var import_drizzle_orm12, COPY_HEADROOM;
var init_queries = __esm({
  "src/core/mail/queries.ts"() {
    "use strict";
    import_drizzle_orm12 = require("drizzle-orm");
    init_db();
    init_schema();
    init_mappers();
    init_spam();
    init_threadSettings();
    init_specialUse();
    COPY_HEADROOM = 4;
  }
});

// src/core/mail/rules.ts
function toRule(row, conditions, actions) {
  return {
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    isEnabled: row.isEnabled,
    matchAll: row.matchAll,
    stopProcessing: row.stopProcessing,
    sortOrder: row.sortOrder,
    conditions,
    actions
  };
}
function listRules(accountId) {
  const db2 = getDb();
  const ruleRows = db2.select().from(rules).where((0, import_drizzle_orm13.eq)(rules.accountId, accountId)).orderBy((0, import_drizzle_orm13.asc)(rules.sortOrder)).all();
  return ruleRows.map((row) => {
    const conditions = db2.select().from(ruleConditions).where((0, import_drizzle_orm13.eq)(ruleConditions.ruleId, row.id)).all().map((c) => ({
      field: c.field,
      op: c.op,
      value: c.value
    }));
    const actions = db2.select().from(ruleActions).where((0, import_drizzle_orm13.eq)(ruleActions.ruleId, row.id)).all().map((a) => ({
      action: a.action,
      value: a.value ?? void 0
    }));
    return toRule(row, conditions, actions);
  });
}
function insertChildren(ruleId, input) {
  const db2 = getDb();
  for (const condition of input.conditions) {
    db2.insert(ruleConditions).values({
      id: (0, import_node_crypto4.randomUUID)(),
      ruleId,
      field: condition.field,
      op: condition.op,
      value: condition.value
    }).run();
  }
  for (const action of input.actions) {
    db2.insert(ruleActions).values({ id: (0, import_node_crypto4.randomUUID)(), ruleId, action: action.action, value: action.value ?? null }).run();
  }
}
function createRule(accountId, input) {
  const db2 = getDb();
  const id = (0, import_node_crypto4.randomUUID)();
  db2.insert(rules).values({
    id,
    accountId,
    name: input.name,
    isEnabled: input.isEnabled,
    matchAll: input.matchAll,
    stopProcessing: input.stopProcessing,
    sortOrder: 0,
    createdAt: Date.now()
  }).run();
  insertChildren(id, input);
  return listRules(accountId).find((r) => r.id === id);
}
function updateRule(ruleId, input) {
  const db2 = getDb();
  const existing = db2.select().from(rules).where((0, import_drizzle_orm13.eq)(rules.id, ruleId)).get();
  if (!existing) throw new Error("Rule not found");
  db2.update(rules).set({
    name: input.name,
    isEnabled: input.isEnabled,
    matchAll: input.matchAll,
    stopProcessing: input.stopProcessing
  }).where((0, import_drizzle_orm13.eq)(rules.id, ruleId)).run();
  db2.delete(ruleConditions).where((0, import_drizzle_orm13.eq)(ruleConditions.ruleId, ruleId)).run();
  db2.delete(ruleActions).where((0, import_drizzle_orm13.eq)(ruleActions.ruleId, ruleId)).run();
  insertChildren(ruleId, input);
  return listRules(existing.accountId).find((r) => r.id === ruleId);
}
function deleteRule(ruleId) {
  getDb().delete(rules).where((0, import_drizzle_orm13.eq)(rules.id, ruleId)).run();
}
function fieldValue(row, field, bodyText) {
  switch (field) {
    case "from":
      return `${row.fromName ?? ""} ${row.fromEmail ?? ""}`.toLowerCase();
    case "to":
      return `${row.toJson ?? ""} ${row.ccJson ?? ""}`.toLowerCase();
    case "subject":
      return (row.subject ?? "").toLowerCase();
    case "body":
      return (bodyText ?? "").toLowerCase();
    default:
      return "";
  }
}
function testOp(value, op, target) {
  const t = target.toLowerCase();
  switch (op) {
    case "contains":
      return value.includes(t);
    case "equals":
      return value === t;
    case "startsWith":
      return value.startsWith(t);
    case "endsWith":
      return value.endsWith(t);
    default:
      return false;
  }
}
function ruleMatches(row, rule, bodyText) {
  if (rule.conditions.length === 0) return false;
  const results = rule.conditions.map((condition) => {
    if (condition.field === "hasAttachment") {
      return (row.hasAttachments ? "yes" : "no") === condition.value.toLowerCase();
    }
    return testOp(fieldValue(row, condition.field, bodyText), condition.op, condition.value);
  });
  return rule.matchAll ? results.every(Boolean) : results.some(Boolean);
}
function evaluateRules(row, ruleList, bodyText) {
  const out = [];
  for (const rule of ruleList) {
    if (ruleMatches(row, rule, bodyText)) {
      out.push(...rule.actions);
      if (rule.stopProcessing) break;
    }
  }
  return out;
}
async function applyRules(accountId) {
  const ruleList = listRules(accountId).filter((r) => r.isEnabled);
  const empty = { matched: 0, moved: 0, targetFolderIds: [] };
  if (ruleList.length === 0) return empty;
  const account = getAccountById(accountId);
  if (!account) return empty;
  const db2 = getDb();
  const folderRows = allFoldersSorted(accountId);
  const targetFolderIds = /* @__PURE__ */ new Set();
  let matched = 0;
  let moved = 0;
  const client = await buildAccountClient(accountId);
  await client.connect();
  try {
    for (const folder of folderRows) {
      const rows = db2.select().from(messages).where((0, import_drizzle_orm13.eq)(messages.folderId, folder.id)).limit(300).all();
      if (rows.length === 0) continue;
      let opened = false;
      for (const row of rows) {
        const body = db2.select().from(messageBodies).where((0, import_drizzle_orm13.eq)(messageBodies.messageId, row.id)).get();
        const actions = evaluateRules(row, ruleList, body?.textPlain ?? null);
        if (actions.length === 0) continue;
        matched += 1;
        if (!opened) {
          await client.mailboxOpen(folder.remotePath);
          opened = true;
        }
        for (const action of actions) {
          if (action.action === "markRead") {
            await client.messageFlagsAdd(String(row.uid), ["\\Seen"], { uid: true });
            db2.update(messages).set({ isRead: true }).where((0, import_drizzle_orm13.eq)(messages.id, row.id)).run();
          } else if (action.action === "markFlagged") {
            await client.messageFlagsAdd(String(row.uid), ["\\Flagged"], { uid: true });
            db2.update(messages).set({ isFlagged: true }).where((0, import_drizzle_orm13.eq)(messages.id, row.id)).run();
          } else if (action.action === "markSpam") {
            db2.update(messages).set({ isSpam: true, spamScore: 100, spamReasons: JSON.stringify(["Matched rule"]) }).where((0, import_drizzle_orm13.eq)(messages.id, row.id)).run();
          } else if (action.action === "move" && action.value) {
            const target = folderRows.find((f) => f.id === action.value);
            if (target && target.id !== folder.id) {
              await client.messageMove(String(row.uid), target.remotePath, { uid: true });
              db2.delete(messages).where((0, import_drizzle_orm13.eq)(messages.id, row.id)).run();
              removeFromIndex(row.id);
              targetFolderIds.add(target.id);
              moved += 1;
              break;
            }
          } else if (action.action === "trash") {
            const trash = folderRows.find((f) => f.specialUse === "trash");
            if (trash && trash.id !== folder.id) {
              await client.messageMove(String(row.uid), trash.remotePath, { uid: true });
              db2.delete(messages).where((0, import_drizzle_orm13.eq)(messages.id, row.id)).run();
              removeFromIndex(row.id);
              targetFolderIds.add(trash.id);
              moved += 1;
              break;
            }
          }
        }
      }
      if (opened) await client.mailboxClose().catch(() => void 0);
    }
  } finally {
    await client.logout().catch(() => void 0);
  }
  return { matched, moved, targetFolderIds: [...targetFolderIds] };
}
var import_node_crypto4, import_drizzle_orm13;
var init_rules = __esm({
  "src/core/mail/rules.ts"() {
    "use strict";
    import_node_crypto4 = require("node:crypto");
    import_drizzle_orm13 = require("drizzle-orm");
    init_db();
    init_schema();
    init_accounts();
    init_auth();
    init_search();
    init_queries();
  }
});

// src/core/mail/sync.ts
function errText(error) {
  return error instanceof Error ? error.message : String(error);
}
function normalizeSpecialUse(mailbox) {
  const raw = (mailbox.specialUse ?? "").replace(/\\/g, "").toLowerCase();
  if (raw) return raw;
  const flags = mailbox.flags ? [...mailbox.flags].map((f) => f.replace(/\\/g, "").toLowerCase()) : [];
  for (const flag of flags) {
    if (["inbox", "sent", "drafts", "trash", "junk", "archive", "all"].includes(flag)) return flag;
  }
  if (mailbox.path.toUpperCase() === "INBOX") return "inbox";
  return inferSpecialUse(mailbox.path, mailbox.name);
}
function upsertFolders(accountId, list) {
  const db2 = getDb();
  const ids = [];
  for (const mailbox of list) {
    const flags = mailbox.flags ? [...mailbox.flags].map((f) => f.replace(/\\/g, "").toLowerCase()) : [];
    if (flags.includes("noselect")) continue;
    const existing = db2.select().from(folders).where((0, import_drizzle_orm14.and)((0, import_drizzle_orm14.eq)(folders.accountId, accountId), (0, import_drizzle_orm14.eq)(folders.remotePath, mailbox.path))).get();
    const specialUse = normalizeSpecialUse(mailbox);
    const rawName = mailbox.name && mailbox.name !== "INBOX" ? mailbox.name : mailbox.path;
    const name = rawName.replace(/^\[Gmail\]\//i, "");
    const sortOrder = specialUse ? ORDER[specialUse] ?? 50 : 100;
    if (existing) {
      db2.update(folders).set({
        name,
        specialUse,
        delimiter: mailbox.delimiter ?? null,
        isSubscribed: mailbox.subscribed ?? true,
        sortOrder
      }).where((0, import_drizzle_orm14.eq)(folders.id, existing.id)).run();
      ids.push(existing.id);
    } else {
      const id = (0, import_node_crypto5.randomUUID)();
      db2.insert(folders).values({
        id,
        accountId,
        remotePath: mailbox.path,
        name,
        specialUse,
        delimiter: mailbox.delimiter ?? null,
        isSubscribed: mailbox.subscribed ?? true,
        sortOrder
      }).run();
      ids.push(id);
    }
  }
  const currentPaths = new Set(ids.map((id) => db2.select().from(folders).where((0, import_drizzle_orm14.eq)(folders.id, id)).get()?.remotePath));
  for (const folder of db2.select().from(folders).where((0, import_drizzle_orm14.eq)(folders.accountId, accountId)).all()) {
    if (!currentPaths.has(folder.remotePath)) {
      db2.delete(messages).where((0, import_drizzle_orm14.eq)(messages.folderId, folder.id)).run();
      db2.delete(folders).where((0, import_drizzle_orm14.eq)(folders.id, folder.id)).run();
    }
  }
  return ids;
}
function toAddressJson(list) {
  if (!list || list.length === 0) return null;
  return JSON.stringify(list.map((a) => ({ name: a.name ?? null, address: a.address ?? null })));
}
function hasAttachment(node) {
  if (!node || typeof node !== "object") return false;
  const obj = node;
  if (obj.disposition === "attachment") return true;
  if (obj.disposition === "inline" && obj.dispositionParameters?.filename) return true;
  if (Array.isArray(obj.childNodes)) return obj.childNodes.some(hasAttachment);
  return false;
}
function resolveThreadId2(accountId, id, messageId, inReplyTo) {
  if (inReplyTo) {
    const parent = getDb().select().from(messages).where((0, import_drizzle_orm14.and)((0, import_drizzle_orm14.eq)(messages.accountId, accountId), (0, import_drizzle_orm14.eq)(messages.messageId, inReplyTo))).get();
    if (parent?.threadId) return parent.threadId;
    return inReplyTo;
  }
  return messageId ?? id;
}
function upsertMessage(accountId, folderId, msg) {
  const db2 = getDb();
  const uid = msg.uid;
  const id = `${folderId}:${uid}`;
  const env = msg.envelope ?? {};
  const from = env.from?.[0];
  const flags = msg.flags ?? /* @__PURE__ */ new Set();
  const base = {
    accountId,
    folderId,
    uid,
    messageId: env.messageId ?? null,
    inReplyTo: env.inReplyTo ?? null,
    refs: null,
    subject: env.subject ?? null,
    fromName: from?.name ?? null,
    fromEmail: from?.address ?? null,
    toJson: toAddressJson(env.to),
    ccJson: toAddressJson(env.cc),
    bccJson: toAddressJson(env.bcc),
    replyToJson: toAddressJson(env.replyTo),
    dateUtc: env.date ? new Date(env.date).getTime() : null,
    internalDate: msg.internalDate ? new Date(msg.internalDate).getTime() : null,
    size: typeof msg.size === "number" ? msg.size : null,
    isRead: flags.has("\\Seen"),
    isFlagged: flags.has("\\Flagged"),
    isAnswered: flags.has("\\Answered"),
    isDraft: flags.has("\\Draft"),
    hasAttachments: hasAttachment(msg.bodyStructure),
    threadId: resolveThreadId2(accountId, id, env.messageId ?? null, env.inReplyTo ?? null)
  };
  if (base.messageId) clearSentPlaceholder(accountId, folderId, base.messageId);
  db2.insert(messages).values({ id, ...base }).onConflictDoUpdate({
    target: [messages.accountId, messages.folderId, messages.uid],
    set: base
  }).run();
  indexMessage(id);
  applyAssessment(id);
}
async function syncOneMailbox(client, accountId, folderId, remotePath, emit) {
  const db2 = getDb();
  const folderRow = db2.select().from(folders).where((0, import_drizzle_orm14.eq)(folders.id, folderId)).get();
  if (!folderRow) return 0;
  try {
    await client.mailboxOpen(remotePath, { readOnly: true });
  } catch (error) {
    throw new Error(`open: ${errText(error)}`);
  }
  try {
    const status = await client.status(remotePath, {
      messages: true,
      unseen: true,
      uidNext: true,
      uidValidity: true
    }).catch((error) => {
      throw new Error(`open: ${errText(error)}`);
    });
    if (!status) {
      throw new Error(`open: could not read mailbox status for ${remotePath}`);
    }
    const uidValidity = Number(status.uidValidity);
    const uidNext = Number(status.uidNext);
    const messagesCount = Number(status.messages ?? 0);
    const unseen = Number(status.unseen ?? 0);
    const reset = folderRow.uidValidity === null || folderRow.uidValidity !== uidValidity;
    if (reset) {
      db2.delete(messages).where((0, import_drizzle_orm14.and)((0, import_drizzle_orm14.eq)(messages.accountId, accountId), (0, import_drizzle_orm14.eq)(messages.folderId, folderId))).run();
    }
    let range;
    let options;
    if (reset || folderRow.uidNext === null) {
      const start = Math.max(1, messagesCount - INITIAL_FETCH + 1);
      range = `${start}:*`;
      options = {};
    } else {
      range = `${folderRow.uidNext}:*`;
      options = { uid: true };
    }
    let count = 0;
    const insertedUids = [];
    try {
      for await (const msg of client.fetch(range, FETCH_FIELDS, options)) {
        upsertMessage(accountId, folderId, msg);
        insertedUids.push(msg.uid);
        count += 1;
      }
    } catch (error) {
      throw new Error(`fetch: ${errText(error)}`);
    }
    if (!reset && folderRow.uidNext !== null && folderRow.specialUse === "inbox") {
      const event = announceNewInboxMessages(accountId, folderId, insertedUids);
      if (event) emit(event);
    }
    let reconcile = "skipped";
    let gaps = [];
    if (!reset) {
      const result = await reconcileMailbox(client, accountId, folderId, folderRow, messagesCount, uidNext);
      reconcile = result.status;
      gaps = result.gaps;
    }
    if (reconcile === "ok" && gaps.length > 0) {
      const wanted = gaps.filter((uid) => !isRecentlyRemoved(accountId, folderId, uid));
      if (wanted.length > 0) {
        try {
          for await (const msg of client.fetch(wanted, FETCH_FIELDS, { uid: true })) {
            upsertMessage(accountId, folderId, msg);
          }
          logLine(`sync:${accountId}`, `refilled ${wanted.length} in ${folderRow.remotePath}`);
        } catch (error) {
          logLine(`sync:${accountId}`, `refill failed in ${folderRow.remotePath}: ${errText(error)}`);
        }
      }
    }
    if (reset || reconcile === "ok" || reconcile === "skipped") {
      db2.update(folders).set({
        uidValidity,
        uidNext,
        unreadCount: unseen,
        totalCount: messagesCount,
        lastMessages: messagesCount,
        lastUidNext: uidNext
      }).where((0, import_drizzle_orm14.eq)(folders.id, folderId)).run();
    } else {
      db2.update(folders).set({ uidValidity, uidNext, unreadCount: unseen, totalCount: messagesCount }).where((0, import_drizzle_orm14.eq)(folders.id, folderId)).run();
    }
    return count;
  } finally {
    await client.mailboxClose().catch(() => void 0);
  }
}
function syncAccount(accountId, emit) {
  const running = inFlight.get(accountId);
  if (running) return running;
  const promise = runSyncAccount(accountId, emit).catch((error) => {
    const message = errText(error);
    logError(`sync:${accountId}`, message);
    emit({ type: "sync:error", accountId, error: message });
    throw error;
  }).finally(() => inFlight.delete(accountId));
  inFlight.set(accountId, promise);
  return promise;
}
async function runSyncAccount(accountId, emit) {
  const protocol = protocolFor(accountId);
  if (protocol === "local") {
    emit({ type: "sync:done", accountId, fetched: 0 });
    return { folders: 0, fetched: 0 };
  }
  if (protocol === "pop3") {
    return fetchPop3(accountId, emit);
  }
  const account = getAccountById(accountId);
  if (!account) throw new Error("Account not found");
  emit({ type: "sync:start", accountId });
  const client = await buildAccountClient(accountId);
  try {
    await client.connect();
  } catch (error) {
    throw new Error(`connect: ${errText(error)}`);
  }
  const db2 = getDb();
  let folderIds = [];
  let fetched = 0;
  try {
    let list;
    try {
      list = await client.list();
    } catch (error) {
      throw new Error(`list: ${errText(error)}`);
    }
    folderIds = upsertFolders(accountId, list);
    for (const folderId of folderIds) {
      const folderRow = db2.select().from(folders).where((0, import_drizzle_orm14.eq)(folders.id, folderId)).get();
      if (!folderRow) continue;
      emit({
        type: "sync:folder",
        accountId,
        folderId,
        folderName: folderRow.name
      });
      try {
        const count = await syncOneMailbox(client, accountId, folderId, folderRow.remotePath, emit);
        fetched += count;
        emit({
          type: "sync:progress",
          accountId,
          folderId,
          folderName: folderRow.name,
          fetched: count
        });
      } catch (error) {
        const message = errText(error);
        logLine(`sync:${accountId}`, `${folderRow.name}: ${message}`);
        emit({
          type: "sync:error",
          accountId,
          folderId,
          folderName: folderRow.name,
          error: message
        });
      }
    }
  } finally {
    await client.logout().catch(() => void 0);
  }
  let targetFolderIds = [];
  try {
    const result = await applyRules(accountId);
    targetFolderIds = result.targetFolderIds;
  } catch {
  }
  if (targetFolderIds.length > 0) {
    const resyncClient = await buildAccountClient(accountId);
    await resyncClient.connect();
    try {
      for (const id of targetFolderIds) {
        const target = getDb().select().from(folders).where((0, import_drizzle_orm14.eq)(folders.id, id)).get();
        if (target) await syncOneMailbox(resyncClient, accountId, id, target.remotePath, emit);
      }
    } catch {
    } finally {
      await resyncClient.logout().catch(() => void 0);
    }
  }
  emit({ type: "sync:done", accountId, fetched });
  return { folders: folderIds.length, fetched };
}
async function syncFolder(folderId, emit) {
  const db2 = getDb();
  const folderRow = db2.select().from(folders).where((0, import_drizzle_orm14.eq)(folders.id, folderId)).get();
  if (!folderRow) throw new Error("Folder not found");
  if (protocolFor(folderRow.accountId) !== "imap") {
    emit({ type: "sync:done", accountId: folderRow.accountId, fetched: 0 });
    return { folders: 1, fetched: 0 };
  }
  const running = inFlight.get(folderRow.accountId);
  if (running) await running.catch(() => void 0);
  const count = await withImap(
    folderRow.accountId,
    (client) => syncOneMailbox(client, folderRow.accountId, folderId, folderRow.remotePath, emit)
  );
  emit({ type: "sync:done", accountId: folderRow.accountId, fetched: count });
  return { folders: 1, fetched: count };
}
var import_node_crypto5, import_drizzle_orm14, INITIAL_FETCH, FETCH_FIELDS, ORDER, inFlight;
var init_sync = __esm({
  "src/core/mail/sync.ts"() {
    "use strict";
    import_node_crypto5 = require("node:crypto");
    import_drizzle_orm14 = require("drizzle-orm");
    init_db();
    init_schema();
    init_accounts();
    init_auth();
    init_connection();
    init_pop3();
    init_search();
    init_reconcile();
    init_announce();
    init_recentUids();
    init_log();
    init_storeMessage();
    init_spam();
    init_rules();
    init_specialUse();
    INITIAL_FETCH = 60;
    FETCH_FIELDS = {
      uid: true,
      envelope: true,
      flags: true,
      internalDate: true,
      size: true,
      bodyStructure: true
    };
    ORDER = SPECIAL_USE_ORDER;
    inFlight = /* @__PURE__ */ new Map();
  }
});

// src/shared/theme.ts
var SETTINGS_KEYS;
var init_theme = __esm({
  "src/shared/theme.ts"() {
    "use strict";
    SETTINGS_KEYS = {
      themeMode: "theme.mode",
      themeAccent: "theme.accent",
      themeCustomAccent: "theme.customAccent",
      blockRemoteImages: "privacy.blockRemoteImages",
      trustedSenders: "privacy.trustedSenders",
      threadedView: "mail.threaded",
      calendarReminderMinutes: "calendar.reminderMinutes",
      dictationEnabled: "compose.dictation"
    };
  }
});

// src/core/mail/security.ts
function trustedSenders() {
  const raw = getSetting(SETTINGS_KEYS.trustedSenders);
  return Array.isArray(raw) ? raw.map((s) => s.toLowerCase()) : [];
}
function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}
function domainOf(email) {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase();
}
function hostMatches(a, b) {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}
function assessPhishing(fromEmail, fromName, replyToJson, htmlRaw, textPlain, trusted) {
  if (fromEmail && trusted.includes(fromEmail.toLowerCase())) {
    return { suspicious: false, reasons: [] };
  }
  const reasons = [];
  const fromDomain = domainOf(fromEmail);
  const html = htmlRaw ?? "";
  if (fromName && fromDomain) {
    const nameEmails = fromName.match(/[\w.+-]+@[\w.-]+/g) ?? [];
    for (const candidate of nameEmails) {
      const d = domainOf(candidate);
      if (d && d !== fromDomain) {
        reasons.push(`Display name claims "${candidate}" but the message is from @${fromDomain}`);
      }
    }
    if (nameEmails.length === 0) {
      const nameDomains = fromName.match(/\b([a-z0-9-]+\.)+[a-z]{2,}\b/gi) ?? [];
      for (const d of nameDomains) {
        const clean = d.toLowerCase().replace(/^www\./, "");
        if (fromDomain && !hostMatches(fromDomain, clean)) {
          reasons.push(`Display name mentions "${d}" but the message is from @${fromDomain}`);
        }
      }
    }
  }
  if (replyToJson) {
    try {
      const list = JSON.parse(replyToJson);
      for (const entry of list) {
        const d = domainOf(entry.address);
        if (d && fromDomain && d !== fromDomain) {
          reasons.push(`Replies go to @${d}, not the sender's @${fromDomain}`);
        }
      }
    } catch {
    }
  }
  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  let linkWarnings = 0;
  while ((match = anchorRe.exec(html)) !== null && linkWarnings < 3) {
    const href = match[1];
    const anchorHtml = match[0];
    const text2 = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const hrefHost = hostOf(href);
    if (!hrefHost) continue;
    const hasImage = /<\s*img\b/i.test(anchorHtml);
    const textUrl = text2.match(/https?:\/\/[^\s]+|(?:[a-z0-9-]+\.)+[a-z]{2,}/i);
    if (textUrl && !hasImage) {
      const textHost = textUrl[0].includes("://") ? hostOf(textUrl[0]) : textUrl[0].replace(/^www\./, "").toLowerCase();
      if (textHost && !hostMatches(hrefHost, textHost)) {
        reasons.push(`A link labelled "${textUrl[0]}" actually points to ${hrefHost}`);
        linkWarnings++;
      }
    }
    if (PUNYCODE.test(hrefHost)) {
      reasons.push(`A link uses a look-alike (punycode) domain: ${hrefHost}`);
      linkWarnings++;
    }
  }
  const allUrls = `${html} ${textPlain ?? ""}`.match(URL_RE) ?? [];
  for (const url of allUrls) {
    const h = hostOf(url);
    if (h && PUNYCODE.test(h)) {
      reasons.push(`Link to a look-alike (punycode) domain: ${h}`);
      break;
    }
  }
  for (const url of allUrls) {
    const h = hostOf(url);
    if (h && SUSPICIOUS_TLDS.some((tld) => h.endsWith(tld))) {
      reasons.push(`Link to a high-risk domain: ${h}`);
      break;
    }
  }
  if (fromName && NON_ASCII.test(fromName)) {
    reasons.push("Sender name mixes in unusual non-Latin characters");
  }
  const unique = [...new Set(reasons)].slice(0, 4);
  return { suspicious: unique.length > 0, reasons: unique };
}
function classifySecurity(htmlRaw, textPlain, attachmentMimeTypes) {
  const text2 = `${htmlRaw ?? ""}
${textPlain ?? ""}`;
  const mimes = attachmentMimeTypes.map((m) => (m ?? "").toLowerCase());
  let signing = "none";
  let encryption = "none";
  if (mimes.includes("application/pgp-signature")) signing = "pgp-mime";
  else if (mimes.includes("application/pkcs7-signature") || mimes.includes("application/x-pkcs7-signature")) {
    signing = "smime";
  }
  if (mimes.includes("application/pgp-encrypted")) encryption = "pgp-mime";
  else if (mimes.includes("application/pkcs7-mime") || mimes.includes("application/x-pkcs7-mime")) {
    encryption = "smime";
  }
  if (signing === "none" && /-----BEGIN PGP SIGNED MESSAGE-----/.test(text2)) {
    signing = "pgp-inline";
  }
  if (encryption === "none" && /-----BEGIN PGP MESSAGE-----/.test(text2)) {
    encryption = "pgp-inline";
  }
  return {
    signing,
    encryption,
    signed: signing !== "none",
    encrypted: encryption !== "none",
    verified: false
  };
}
var PUNYCODE, SUSPICIOUS_TLDS, URL_RE, NON_ASCII;
var init_security = __esm({
  "src/core/mail/security.ts"() {
    "use strict";
    init_theme();
    init_settings();
    PUNYCODE = /xn--/i;
    SUSPICIOUS_TLDS = [
      ".zip",
      ".mov",
      ".top",
      ".xyz",
      ".click",
      ".link",
      ".work",
      ".review",
      ".country",
      ".gq",
      ".tk",
      ".ml",
      ".cf",
      ".kim",
      ".cricket",
      ".science",
      ".party"
    ];
    URL_RE = /https?:\/\/[^\s"'<>)]+/gi;
    NON_ASCII = /[^\u0000-\u007f]/;
  }
});

// src/core/mail/messages.ts
function parseAddresses(json) {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return parsed.map((a) => a.name ? `${a.name} <${a.address ?? ""}>` : a.address ?? "").filter(Boolean);
  } catch {
    return [];
  }
}
function normalizeContentId(cid) {
  return cid.replace(/^<|>$/g, "").trim();
}
function parseReasons(json) {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function toDetail(row, textPlain, htmlRaw, attachmentRows, inlineImages, security, phishing) {
  return {
    ...toMessageSummary(row),
    messageId: row.messageId,
    inReplyTo: row.inReplyTo,
    refs: row.refs,
    to: parseAddresses(row.toJson),
    cc: parseAddresses(row.ccJson),
    bcc: parseAddresses(row.bccJson),
    textPlain,
    htmlRaw,
    attachments: attachmentRows.map(toAttachmentSummary),
    inlineImages,
    spamReasons: parseReasons(row.spamReasons),
    security,
    phishing
  };
}
async function fetchAndStoreBody(messageId) {
  const db2 = getDb();
  const row = db2.select().from(messages).where((0, import_drizzle_orm15.eq)(messages.id, messageId)).get();
  if (!row) return;
  const folderRow = db2.select().from(folders).where((0, import_drizzle_orm15.eq)(folders.id, row.folderId)).get();
  if (!folderRow) return;
  await withImap(row.accountId, async (client) => {
    await client.mailboxOpen(folderRow.remotePath, { readOnly: true });
    const fetched = await client.fetchOne(String(row.uid), { source: true }, { uid: true });
    if (!fetched || !fetched.source) return;
    const parsed = await (0, import_mailparser2.simpleParser)(fetched.source);
    const textPlain = typeof parsed.text === "string" ? parsed.text : null;
    const htmlRaw = typeof parsed.html === "string" ? parsed.html : null;
    const snippet = (textPlain ?? "").replace(/\s+/g, " ").trim().slice(0, 240) || null;
    const hasAttachments = parsed.attachments.length > 0;
    db2.insert(messageBodies).values({ messageId, textPlain, htmlRaw, fetchedAt: Date.now() }).onConflictDoUpdate({
      target: messageBodies.messageId,
      set: { textPlain, htmlRaw, fetchedAt: Date.now() }
    }).run();
    db2.delete(attachments).where((0, import_drizzle_orm15.eq)(attachments.messageId, messageId)).run();
    for (const att of parsed.attachments) {
      const id = (0, import_node_crypto6.randomUUID)();
      let contentPath = null;
      if (att.content && Buffer.isBuffer(att.content)) {
        try {
          contentPath = saveAttachment(messageId, id, att.filename ?? null, att.content);
        } catch {
          contentPath = null;
        }
      }
      db2.insert(attachments).values({
        id,
        messageId,
        filename: att.filename ?? null,
        mimeType: att.contentType ?? null,
        size: typeof att.size === "number" ? att.size : null,
        contentId: att.cid ? normalizeContentId(att.cid) : null,
        isInline: att.contentDisposition === "inline" || Boolean(att.cid),
        contentPath
      }).run();
    }
    db2.update(messages).set({ snippet, hasAttachments }).where((0, import_drizzle_orm15.eq)(messages.id, messageId)).run();
    indexMessage(messageId);
    applyAssessment(messageId);
  });
}
async function getMessageDetail(messageId) {
  return loadDetail(messageId, true);
}
async function loadDetail(messageId, fetchBody) {
  const db2 = getDb();
  let row = db2.select().from(messages).where((0, import_drizzle_orm15.eq)(messages.id, messageId)).get();
  if (!row) return null;
  let body = db2.select().from(messageBodies).where((0, import_drizzle_orm15.eq)(messageBodies.messageId, messageId)).get();
  if (!body && fetchBody) {
    await fetchAndStoreBody(messageId);
    row = db2.select().from(messages).where((0, import_drizzle_orm15.eq)(messages.id, messageId)).get();
    if (!row) return null;
    body = db2.select().from(messageBodies).where((0, import_drizzle_orm15.eq)(messageBodies.messageId, messageId)).get();
  }
  let attachmentRows = db2.select().from(attachments).where((0, import_drizzle_orm15.eq)(attachments.messageId, messageId)).all();
  if (fetchBody && protocolFor(row.accountId) === "imap" && attachmentRows.length > 0 && attachmentRows.every((att) => att.contentPath === null)) {
    try {
      await fetchAndStoreBody(messageId);
      attachmentRows = db2.select().from(attachments).where((0, import_drizzle_orm15.eq)(attachments.messageId, messageId)).all();
    } catch {
    }
  }
  const inlineImages = [];
  for (const att of attachmentRows) {
    if (!att.isInline || !att.contentId || !att.contentPath) continue;
    const dataUrl = readAttachmentDataUrl(att.contentPath, att.mimeType);
    if (dataUrl) inlineImages.push({ contentId: att.contentId, dataUrl });
  }
  const security = classifySecurity(
    body?.htmlRaw ?? null,
    body?.textPlain ?? null,
    attachmentRows.map((att) => att.mimeType ?? "")
  );
  const folderRow = db2.select().from(folders).where((0, import_drizzle_orm15.eq)(folders.id, row.folderId)).get();
  const folderRole = folderRow?.specialUse ?? (folderRow ? inferSpecialUse(folderRow.remotePath, folderRow.name) : null);
  const phishing = folderRole === "sent" || folderRole === "drafts" ? { suspicious: false, reasons: [] } : assessPhishing(
    row.fromEmail,
    row.fromName,
    row.replyToJson,
    body?.htmlRaw ?? null,
    body?.textPlain ?? null,
    trustedSenders()
  );
  return toDetail(
    row,
    body?.textPlain ?? null,
    body?.htmlRaw ?? null,
    attachmentRows,
    inlineImages,
    security,
    phishing
  );
}
async function getConversation(messageId) {
  const ids = threadMessageIds(messageId).slice(-30);
  const details = [];
  for (const id of ids) {
    const detail = await loadDetail(id, false);
    if (detail) details.push(detail);
  }
  return details;
}
async function downloadAttachment(attachmentId) {
  const db2 = getDb();
  const row = db2.select().from(attachments).where((0, import_drizzle_orm15.eq)(attachments.id, attachmentId)).get();
  if (!row || !row.contentPath) return { saved: false };
  const result = await platform().showSaveDialog(row.filename ?? "attachment");
  if (result.canceled || !result.filePath) return { saved: false };
  (0, import_node_fs4.copyFileSync)(attachmentAbsolutePath(row.contentPath), result.filePath);
  return { saved: true, path: result.filePath };
}
function getAttachmentPath(attachmentId) {
  const row = getDb().select().from(attachments).where((0, import_drizzle_orm15.eq)(attachments.id, attachmentId)).get();
  if (!row || !row.contentPath) return null;
  return attachmentAbsolutePath(row.contentPath);
}
async function openAttachment(attachmentId) {
  const row = getDb().select().from(attachments).where((0, import_drizzle_orm15.eq)(attachments.id, attachmentId)).get();
  if (!row || !row.contentPath) return { opened: false, error: "Attachment is not cached yet" };
  try {
    const dir = (0, import_node_path3.join)((0, import_node_os.tmpdir)(), "clover-attachments", attachmentId);
    (0, import_node_fs4.mkdirSync)(dir, { recursive: true });
    const safeName = (0, import_node_path3.basename)(row.filename || `attachment-${attachmentId}`) || `attachment-${attachmentId}`;
    let target = (0, import_node_path3.join)(dir, safeName);
    const source = attachmentAbsolutePath(row.contentPath);
    try {
      (0, import_node_fs4.copyFileSync)(source, target);
    } catch {
      target = (0, import_node_path3.join)(dir, `${Date.now()}-${safeName}`);
      (0, import_node_fs4.copyFileSync)(source, target);
    }
    const error = await platform().openPath(target);
    return { opened: !error, error: error || void 0 };
  } catch (error) {
    return { opened: false, error: error.message };
  }
}
function readAttachmentText(attachmentId) {
  const row = getDb().select().from(attachments).where((0, import_drizzle_orm15.eq)(attachments.id, attachmentId)).get();
  if (!row || !row.contentPath) return null;
  try {
    const buffer = (0, import_node_fs4.readFileSync)(attachmentAbsolutePath(row.contentPath));
    return buffer.subarray(0, 2e5).toString("utf8");
  } catch {
    return null;
  }
}
async function withMessageMailbox(messageId, fn) {
  const db2 = getDb();
  const row = db2.select().from(messages).where((0, import_drizzle_orm15.eq)(messages.id, messageId)).get();
  if (!row) return null;
  const folderRow = db2.select().from(folders).where((0, import_drizzle_orm15.eq)(folders.id, row.folderId)).get();
  if (!folderRow) return null;
  return withImap(row.accountId, async (client) => {
    await client.mailboxOpen(folderRow.remotePath);
    return fn(client, row.uid, folderRow.remotePath);
  });
}
async function setFlags(messageId, flags) {
  const db2 = getDb();
  const row = db2.select().from(messages).where((0, import_drizzle_orm15.eq)(messages.id, messageId)).get();
  if (row && protocolFor(row.accountId) === "imap" && (flags.seen !== void 0 || flags.flagged !== void 0)) {
    await withMessageMailbox(messageId, async (client, uid) => {
      if (flags.seen !== void 0) {
        if (flags.seen) await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
        else await client.messageFlagsRemove(String(uid), ["\\Seen"], { uid: true });
      }
      if (flags.flagged !== void 0) {
        if (flags.flagged) await client.messageFlagsAdd(String(uid), ["\\Flagged"], { uid: true });
        else await client.messageFlagsRemove(String(uid), ["\\Flagged"], { uid: true });
      }
    });
  }
  const set = {};
  if (flags.seen !== void 0) set.isRead = flags.seen;
  if (flags.flagged !== void 0) set.isFlagged = flags.flagged;
  if (flags.important !== void 0) set.isImportant = flags.important;
  if (Object.keys(set).length) {
    db2.update(messages).set(set).where((0, import_drizzle_orm15.eq)(messages.id, messageId)).run();
  }
}
async function moveMessage(messageId, targetFolderId) {
  const db2 = getDb();
  const target = db2.select().from(folders).where((0, import_drizzle_orm15.eq)(folders.id, targetFolderId)).get();
  if (!target) return null;
  const row = db2.select().from(messages).where((0, import_drizzle_orm15.eq)(messages.id, messageId)).get();
  if (!row) return null;
  if (protocolFor(row.accountId) !== "imap") {
    db2.update(messages).set({ folderId: targetFolderId }).where((0, import_drizzle_orm15.eq)(messages.id, messageId)).run();
    return {
      accountId: row.accountId,
      fromFolderId: row.folderId,
      toFolderId: targetFolderId,
      uid: row.uid,
      messageId: row.messageId
    };
  }
  const response = await withMessageMailbox(
    messageId,
    (client, uid) => client.messageMove(String(uid), target.remotePath, { uid: true })
  );
  const newUid = response && response.uidMap ? response.uidMap.get(row.uid) ?? null : null;
  db2.delete(messages).where((0, import_drizzle_orm15.eq)(messages.id, messageId)).run();
  removeFromIndex(messageId);
  return {
    accountId: row.accountId,
    fromFolderId: row.folderId,
    toFolderId: targetFolderId,
    uid: newUid,
    messageId: row.messageId
  };
}
async function deleteMessage(messageId) {
  const db2 = getDb();
  const row = db2.select().from(messages).where((0, import_drizzle_orm15.eq)(messages.id, messageId)).get();
  if (row && protocolFor(row.accountId) === "imap") {
    await withMessageMailbox(messageId, async (client, uid) => {
      await client.messageDelete(String(uid), { uid: true });
    });
    markRecentlyRemoved(row.accountId, row.folderId, [row.uid]);
  }
  db2.delete(messages).where((0, import_drizzle_orm15.eq)(messages.id, messageId)).run();
  removeFromIndex(messageId);
}
var import_mailparser2, import_node_crypto6, import_node_fs4, import_node_os, import_node_path3, import_drizzle_orm15;
var init_messages = __esm({
  "src/core/mail/messages.ts"() {
    "use strict";
    import_mailparser2 = require("mailparser");
    import_node_crypto6 = require("node:crypto");
    import_node_fs4 = require("node:fs");
    import_node_os = require("node:os");
    import_node_path3 = require("node:path");
    init_platform();
    import_drizzle_orm15 = require("drizzle-orm");
    init_db();
    init_schema();
    init_accounts();
    init_connection();
    init_search();
    init_queries();
    init_spam();
    init_recentUids();
    init_storage();
    init_security();
    init_specialUse();
    init_mappers();
  }
});

// src/core/mail/send.ts
function nextSyntheticUid() {
  syntheticUidCounter += 1;
  return -(Date.now() % 2e9) - syntheticUidCounter;
}
function sentFolderFromList(list) {
  return list.find((f) => f.specialUse === "sent") ?? list.find((f) => inferSpecialUse(f.remotePath, f.name) === "sent");
}
function looksLikeGmail(list) {
  return list.some((f) => /\[gmail\]/i.test(f.remotePath) || /^all mail$/i.test(f.name.trim()));
}
function insertSentFolder(accountId, remotePath) {
  const db2 = getDb();
  const existing = db2.select().from(folders).where((0, import_drizzle_orm16.and)((0, import_drizzle_orm16.eq)(folders.accountId, accountId), (0, import_drizzle_orm16.eq)(folders.remotePath, remotePath))).get();
  if (existing) return existing;
  const id = (0, import_node_crypto7.randomUUID)();
  db2.insert(folders).values({
    id,
    accountId,
    remotePath,
    name: "Sent",
    specialUse: "sent",
    sortOrder: SPECIAL_USE_ORDER.sent ?? 2,
    isSubscribed: true,
    isVisible: true
  }).run();
  return db2.select().from(folders).where((0, import_drizzle_orm16.eq)(folders.id, id)).get();
}
async function resolveSentFolder(accountId) {
  const db2 = getDb();
  const list = db2.select().from(folders).where((0, import_drizzle_orm16.eq)(folders.accountId, accountId)).all();
  const found = sentFolderFromList(list);
  if (found) {
    if (found.specialUse !== "sent") {
      db2.update(folders).set({ specialUse: "sent", sortOrder: SPECIAL_USE_ORDER.sent ?? 2 }).where((0, import_drizzle_orm16.eq)(folders.id, found.id)).run();
      return { ...found, specialUse: "sent" };
    }
    return found;
  }
  if (protocolFor(accountId) === "imap") {
    try {
      let createdPath = "Sent";
      await withImap(accountId, async (client) => {
        await client.mailboxCreate(createdPath);
        const refreshed = await client.list();
        const sent = refreshed.find((m) => inferSpecialUse(m.path, m.name) === "sent");
        if (sent?.path) createdPath = sent.path;
      });
      return insertSentFolder(accountId, createdPath);
    } catch {
      return void 0;
    }
  }
  return insertSentFolder(accountId, "Sent");
}
function extractInlineImages(html) {
  if (!html) return { html, inline: [] };
  const inline = [];
  let index2 = 0;
  const out = html.replace(
    /src="data:(image\/[a-z0-9.+-]+);base64,([^"]+)"/gi,
    (_match, mime, base64) => {
      index2 += 1;
      const ext = mime.split("/")[1] ?? "png";
      const cid = `clover-inline-${index2}-${Date.now()}@clover.mail`;
      inline.push({
        filename: `image-${index2}.${ext}`,
        cid,
        content: Buffer.from(base64, "base64"),
        contentType: mime
      });
      return `src="cid:${cid}"`;
    }
  );
  return { html: out, inline };
}
async function deliverMessage(input) {
  const account = getAccountById(input.accountId);
  if (!account) throw new Error("Account not found");
  const auth = await getAccountAuth(input.accountId);
  if (!auth) throw new Error("No credentials for account");
  const { html, inline } = extractInlineImages(input.html);
  const attachments2 = [
    ...input.attachments?.map((a) => ({ filename: a.filename, path: a.path })) ?? [],
    ...inline.map((item) => ({
      filename: item.filename,
      content: item.content,
      contentType: item.contentType,
      cid: item.cid,
      contentDisposition: "inline"
    }))
  ];
  const transport = buildTransport(account.outgoing, auth);
  const fromEmail = input.fromEmail || account.email;
  const fromName = input.fromName ?? (input.fromEmail ? null : account.displayName);
  const from = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;
  let raw;
  try {
    const info = await transport.sendMail({
      from,
      to: input.to.join(", "),
      cc: input.cc?.length ? input.cc.join(", ") : void 0,
      bcc: input.bcc?.length ? input.bcc.join(", ") : void 0,
      subject: input.subject,
      text: input.text,
      html,
      attachments: attachments2.length ? attachments2 : void 0,
      inReplyTo: input.inReplyTo,
      references: input.references
    });
    if (info.rejected && info.rejected.length > 0 && (!info.accepted || info.accepted.length === 0)) {
      throw new Error(`The mail server rejected the recipient(s): ${info.rejected.join(", ")}`);
    }
    raw = info.message;
  } finally {
    transport.close();
  }
  try {
    if (raw) {
      const sentFolder = await resolveSentFolder(input.accountId);
      if (sentFolder) {
        const accountFolders = getDb().select().from(folders).where((0, import_drizzle_orm16.eq)(folders.accountId, input.accountId)).all();
        let serverUid;
        if (protocolFor(input.accountId) === "imap" && !looksLikeGmail(accountFolders)) {
          try {
            await withImap(input.accountId, async (client) => {
              const result = await client.append(sentFolder.remotePath, raw, ["\\Seen"]);
              if (result && typeof result.uid === "number") serverUid = result.uid;
            });
          } catch {
          }
        }
        const parsed = await (0, import_mailparser3.simpleParser)(raw);
        storeParsedMessage(
          input.accountId,
          sentFolder.id,
          typeof serverUid === "number" ? serverUid : nextSyntheticUid(),
          parsed,
          raw,
          { assessSpam: false }
        );
      }
    }
  } catch {
  }
}
var import_node_crypto7, import_mailparser3, import_drizzle_orm16, syntheticUidCounter;
var init_send = __esm({
  "src/core/mail/send.ts"() {
    "use strict";
    import_node_crypto7 = require("node:crypto");
    import_mailparser3 = require("mailparser");
    init_db();
    import_drizzle_orm16 = require("drizzle-orm");
    init_schema();
    init_accounts();
    init_auth();
    init_smtp();
    init_connection();
    init_storeMessage();
    init_specialUse();
    syntheticUidCounter = 0;
  }
});

// src/core/mail/outbox.ts
function toItem(row) {
  let subject = "";
  let to = [];
  try {
    const payload = JSON.parse(row.payload);
    subject = payload.subject ?? "";
    to = payload.to ?? [];
  } catch {
  }
  return {
    id: row.id,
    accountId: row.accountId,
    subject,
    to,
    status: row.status,
    error: row.error,
    attempts: row.attempts,
    sendAt: row.sendAt,
    createdAt: row.createdAt
  };
}
function enqueueOutbox(input, sendAt = Date.now()) {
  const id = (0, import_node_crypto8.randomUUID)();
  const now = Date.now();
  getDb().insert(outbox).values({
    id,
    accountId: input.accountId,
    payload: JSON.stringify(input),
    status: "queued",
    error: null,
    attempts: 0,
    sendAt,
    createdAt: now,
    updatedAt: now
  }).run();
  return id;
}
function listOutbox() {
  return getDb().select().from(outbox).orderBy((0, import_drizzle_orm17.asc)(outbox.sendAt)).all().map(toItem);
}
function cancelOutbox(id) {
  getDb().delete(outbox).where((0, import_drizzle_orm17.eq)(outbox.id, id)).run();
}
function retryOutbox(id) {
  getDb().update(outbox).set({ status: "queued", error: null, sendAt: Date.now(), updatedAt: Date.now() }).where((0, import_drizzle_orm17.eq)(outbox.id, id)).run();
}
async function deliverRow(row) {
  const db2 = getDb();
  db2.update(outbox).set({ status: "sending", updatedAt: Date.now() }).where((0, import_drizzle_orm17.eq)(outbox.id, row.id)).run();
  try {
    await deliverMessage(JSON.parse(row.payload));
    db2.delete(outbox).where((0, import_drizzle_orm17.eq)(outbox.id, row.id)).run();
    return true;
  } catch (error) {
    db2.update(outbox).set({
      status: "failed",
      error: error.message,
      attempts: row.attempts + 1,
      updatedAt: Date.now()
    }).where((0, import_drizzle_orm17.eq)(outbox.id, row.id)).run();
    return false;
  }
}
async function sendNow(input) {
  const id = enqueueOutbox(input, Date.now());
  const row = getDb().select().from(outbox).where((0, import_drizzle_orm17.eq)(outbox.id, id)).get();
  if (!row) return;
  const ok = await deliverRow(row);
  if (!ok) {
    const failed = getDb().select().from(outbox).where((0, import_drizzle_orm17.eq)(outbox.id, id)).get();
    throw new Error(failed?.error ?? "Could not send the message");
  }
}
var import_node_crypto8, import_drizzle_orm17;
var init_outbox = __esm({
  "src/core/mail/outbox.ts"() {
    "use strict";
    import_node_crypto8 = require("node:crypto");
    import_drizzle_orm17 = require("drizzle-orm");
    init_db();
    init_schema();
    init_send();
  }
});

// src/core/mail/snippets.ts
function listSnippets() {
  return getDb().select().from(snippets).orderBy((0, import_drizzle_orm18.asc)(snippets.createdAt)).all().map((row) => ({ id: row.id, name: row.name, body: row.body }));
}
function addSnippet(name, body) {
  const id = (0, import_node_crypto9.randomUUID)();
  getDb().insert(snippets).values({ id, name, body, createdAt: Date.now() }).run();
  return { id, name, body };
}
function deleteSnippet(id) {
  getDb().delete(snippets).where((0, import_drizzle_orm18.eq)(snippets.id, id)).run();
}
var import_node_crypto9, import_drizzle_orm18;
var init_snippets = __esm({
  "src/core/mail/snippets.ts"() {
    "use strict";
    import_node_crypto9 = require("node:crypto");
    import_drizzle_orm18 = require("drizzle-orm");
    init_db();
    init_schema();
  }
});

// src/core/mail/snooze.ts
function snooze(messageId, untilMs) {
  getDb().update(messages).set({ snoozedUntil: untilMs }).where((0, import_drizzle_orm19.eq)(messages.id, messageId)).run();
}
function unsnooze(messageId) {
  getDb().update(messages).set({ snoozedUntil: null }).where((0, import_drizzle_orm19.eq)(messages.id, messageId)).run();
}
var import_drizzle_orm19;
var init_snooze = __esm({
  "src/core/mail/snooze.ts"() {
    "use strict";
    import_drizzle_orm19 = require("drizzle-orm");
    init_db();
    init_schema();
  }
});

// src/core/mail/schedules.ts
function scheduleSend(payload, sendAt) {
  return enqueueOutbox(payload, sendAt);
}
function listScheduled() {
  const now = Date.now();
  return listOutbox().filter((item) => item.sendAt > now).map((item) => ({
    id: item.id,
    accountId: item.accountId,
    subject: item.subject,
    sendAt: item.sendAt
  }));
}
function cancelScheduled(id) {
  cancelOutbox(id);
}
var init_schedules = __esm({
  "src/core/mail/schedules.ts"() {
    "use strict";
    init_outbox();
  }
});

// src/core/mail/labels.ts
function listLabels() {
  return getDb().select().from(labels).orderBy((0, import_drizzle_orm20.asc)(labels.createdAt)).all().map((row) => ({ id: row.id, name: row.name, color: row.color }));
}
function createLabel(name, color) {
  const id = (0, import_node_crypto10.randomUUID)();
  const chosen = color ?? COLORS2[listLabels().length % COLORS2.length];
  getDb().insert(labels).values({ id, name, color: chosen, createdAt: Date.now() }).run();
  return { id, name, color: chosen };
}
function deleteLabel(id) {
  const db2 = getDb();
  db2.delete(messageLabels).where((0, import_drizzle_orm20.eq)(messageLabels.labelId, id)).run();
  db2.delete(labels).where((0, import_drizzle_orm20.eq)(labels.id, id)).run();
}
function addLabelToMessage(messageId, labelId) {
  getDb().insert(messageLabels).values({ messageId, labelId }).onConflictDoNothing().run();
}
function removeLabelFromMessage(messageId, labelId) {
  getDb().delete(messageLabels).where((0, import_drizzle_orm20.and)((0, import_drizzle_orm20.eq)(messageLabels.messageId, messageId), (0, import_drizzle_orm20.eq)(messageLabels.labelId, labelId))).run();
}
function labelIdsForMessage(messageId) {
  return getDb().select().from(messageLabels).where((0, import_drizzle_orm20.eq)(messageLabels.messageId, messageId)).all().map((row) => row.labelId);
}
function listLabelMessages(labelId) {
  const ids = getDb().select().from(messageLabels).where((0, import_drizzle_orm20.eq)(messageLabels.labelId, labelId)).all().map((row) => row.messageId);
  if (ids.length === 0) return [];
  return getDb().select().from(messages).where((0, import_drizzle_orm20.inArray)(messages.id, ids)).all().sort((a, b) => (b.dateUtc ?? 0) - (a.dateUtc ?? 0)).map(toMessageSummary);
}
var import_node_crypto10, import_drizzle_orm20, COLORS2;
var init_labels = __esm({
  "src/core/mail/labels.ts"() {
    "use strict";
    import_node_crypto10 = require("node:crypto");
    import_drizzle_orm20 = require("drizzle-orm");
    init_db();
    init_schema();
    init_mappers();
    COLORS2 = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#f43f5e", "#64748b"];
  }
});

// src/core/mail/savedSearches.ts
function listSavedSearches() {
  return getDb().select().from(savedSearches).orderBy((0, import_drizzle_orm21.asc)(savedSearches.createdAt)).all().map((row) => ({ id: row.id, name: row.name, query: row.query }));
}
function createSavedSearch(name, query) {
  const id = (0, import_node_crypto11.randomUUID)();
  getDb().insert(savedSearches).values({ id, name, query, createdAt: Date.now() }).run();
  return { id, name, query };
}
function deleteSavedSearch(id) {
  getDb().delete(savedSearches).where((0, import_drizzle_orm21.eq)(savedSearches.id, id)).run();
}
var import_node_crypto11, import_drizzle_orm21;
var init_savedSearches = __esm({
  "src/core/mail/savedSearches.ts"() {
    "use strict";
    import_node_crypto11 = require("node:crypto");
    import_drizzle_orm21 = require("drizzle-orm");
    init_db();
    init_schema();
  }
});

// src/core/mail/importMail.ts
function splitMbox(text2) {
  const out = [];
  const lines = text2.split(/\r?\n/);
  let current = null;
  for (const line of lines) {
    if (/^From \S+ .*\d{4}/.test(line)) {
      if (current) out.push(Buffer.from(current.join("\n"), "utf8"));
      current = [];
    } else if (current) {
      current.push(line);
    }
  }
  if (current) out.push(Buffer.from(current.join("\n"), "utf8"));
  return out.filter((buffer) => buffer.length > 0);
}
async function importMboxFile(filePath) {
  const account = ensureLocalAccount(LOCAL_EMAIL, "Imported Mail");
  const folderId = ensureFolder(account.id, "Imported");
  const parts = splitMbox((0, import_node_fs5.readFileSync)(filePath, "utf8"));
  let imported = 0;
  let skipped = 0;
  let uid = nextUidForFolder(folderId);
  for (const source of parts) {
    try {
      const parsed = await (0, import_mailparser4.simpleParser)(source);
      storeParsedMessage(account.id, folderId, uid, parsed, source);
      uid += 1;
      imported += 1;
    } catch {
      skipped += 1;
    }
  }
  return { imported, skipped, accountId: account.id, folderId };
}
async function pickAndImportMbox() {
  const result = await platform().showOpenDialog({
    title: "Import mailbox",
    filters: [
      { name: "Mailbox", extensions: ["mbox", "mbx", "eml"] },
      { name: "All files", extensions: ["*"] }
    ]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return importMboxFile(result.filePaths[0]);
}
var import_node_fs5, import_mailparser4, LOCAL_EMAIL;
var init_importMail = __esm({
  "src/core/mail/importMail.ts"() {
    "use strict";
    import_node_fs5 = require("node:fs");
    import_mailparser4 = require("mailparser");
    init_platform();
    init_accounts();
    init_storeMessage();
    LOCAL_EMAIL = "imported@clover.local";
  }
});

// src/core/mail/folders.ts
async function createFolder(accountId, name, parentRemotePath) {
  if (protocolFor(accountId) !== "imap") {
    ensureFolder(accountId, name);
    return;
  }
  const client = await buildAccountClient(accountId);
  await client.connect();
  try {
    const list = await client.list();
    const delimiter = list.find((m) => m.delimiter)?.delimiter ?? "/";
    const path = parentRemotePath ? `${parentRemotePath}${delimiter}${name}` : name;
    await client.mailboxCreate(path);
    const refreshed = await client.list();
    upsertFolders(accountId, refreshed);
  } finally {
    await client.logout().catch(() => void 0);
  }
}
async function renameFolder(folderId, newName) {
  const db2 = getDb();
  const folder = db2.select().from(folders).where((0, import_drizzle_orm22.eq)(folders.id, folderId)).get();
  if (!folder) return;
  if (protocolFor(folder.accountId) !== "imap") {
    db2.update(folders).set({ name: newName, remotePath: newName }).where((0, import_drizzle_orm22.eq)(folders.id, folderId)).run();
    return;
  }
  await withImap(folder.accountId, async (client) => {
    const delimiter = folder.delimiter || "/";
    const parent = folder.remotePath.includes(delimiter) ? folder.remotePath.slice(0, folder.remotePath.lastIndexOf(delimiter)) : "";
    const target = parent ? `${parent}${delimiter}${newName}` : newName;
    await client.mailboxRename(folder.remotePath, target);
    db2.update(folders).set({ name: newName, remotePath: target }).where((0, import_drizzle_orm22.eq)(folders.id, folderId)).run();
  });
}
async function deleteFolder(folderId) {
  const db2 = getDb();
  const folder = db2.select().from(folders).where((0, import_drizzle_orm22.eq)(folders.id, folderId)).get();
  if (!folder) return;
  if (protocolFor(folder.accountId) === "imap") {
    await withImap(folder.accountId, async (client) => {
      await client.mailboxDelete(folder.remotePath);
    });
  }
  db2.delete(messages).where((0, import_drizzle_orm22.eq)(messages.folderId, folderId)).run();
  db2.delete(folders).where((0, import_drizzle_orm22.eq)(folders.id, folderId)).run();
}
function setFolderVisible(folderId, visible) {
  getDb().update(folders).set({ isVisible: visible }).where((0, import_drizzle_orm22.eq)(folders.id, folderId)).run();
}
var import_drizzle_orm22;
var init_folders = __esm({
  "src/core/mail/folders.ts"() {
    "use strict";
    import_drizzle_orm22 = require("drizzle-orm");
    init_db();
    init_schema();
    init_auth();
    init_accounts();
    init_connection();
    init_storeMessage();
    init_sync();
  }
});

// src/core/mail/aliases.ts
function getDefaultFrom(accountId) {
  const value = getSetting(DEFAULT_FROM_PREFIX + accountId);
  return typeof value === "string" && value ? value : null;
}
function setDefaultFrom(accountId, email) {
  if (!email) deleteSetting(DEFAULT_FROM_PREFIX + accountId);
  else setSetting(DEFAULT_FROM_PREFIX + accountId, email);
}
function listAliases(accountId) {
  return getDb().select().from(accountAliases).where((0, import_drizzle_orm23.eq)(accountAliases.accountId, accountId)).orderBy((0, import_drizzle_orm23.asc)(accountAliases.createdAt)).all().map((row) => ({ id: row.id, accountId: row.accountId, name: row.name, email: row.email }));
}
function addAlias(accountId, email, name) {
  const id = (0, import_node_crypto12.randomUUID)();
  getDb().insert(accountAliases).values({
    id,
    accountId,
    email: email.trim(),
    name: name?.trim() || null,
    createdAt: Date.now()
  }).run();
  return listAliases(accountId).find((a) => a.id === id);
}
function deleteAlias(id) {
  getDb().delete(accountAliases).where((0, import_drizzle_orm23.eq)(accountAliases.id, id)).run();
}
var import_node_crypto12, import_drizzle_orm23, DEFAULT_FROM_PREFIX;
var init_aliases = __esm({
  "src/core/mail/aliases.ts"() {
    "use strict";
    import_node_crypto12 = require("node:crypto");
    import_drizzle_orm23 = require("drizzle-orm");
    init_db();
    init_schema();
    init_settings();
    DEFAULT_FROM_PREFIX = "mail.defaultFrom.";
  }
});

// src/core/mail/archive.ts
function addressLine(json) {
  if (!json) return "";
  try {
    const list = JSON.parse(json);
    return list.map((a) => a.name ? `${a.name} <${a.address ?? ""}>` : a.address ?? "").filter(Boolean).join(", ");
  } catch {
    return "";
  }
}
async function exportFolderMbox(folderId) {
  const db2 = getDb();
  const folder = db2.select().from(folders).where((0, import_drizzle_orm24.eq)(folders.id, folderId)).get();
  if (!folder) return { saved: false };
  const rows = db2.select({ id: messages.id, uid: messages.uid, internalDate: messages.internalDate }).from(messages).where((0, import_drizzle_orm24.eq)(messages.folderId, folderId)).all();
  if (rows.length === 0) return { saved: false };
  const result = await platform().showSaveDialog(
    `${folder.name.replace(/[^\w.-]+/g, "_")}.mbox`
  );
  if (result.canceled || !result.filePath) return { saved: false };
  const out = (0, import_node_fs6.createWriteStream)(result.filePath);
  let count = 0;
  if (protocolFor(folder.accountId) === "imap") {
    await withImap(folder.accountId, async (client) => {
      await client.mailboxOpen(folder.remotePath, { readOnly: true });
      for (const row of rows) {
        const fetched = await client.fetchOne(String(row.uid), { source: true }, { uid: true });
        if (fetched && fetched.source) {
          const date = row.internalDate ? new Date(row.internalDate).toUTCString() : (/* @__PURE__ */ new Date()).toUTCString();
          out.write(`From clover ${date}\r
`);
          out.write(fetched.source);
          if (fetched.source[fetched.source.length - 1] !== 10) out.write("\r\n");
          out.write("\r\n");
          count += 1;
        }
      }
    });
  } else {
    for (const row of rows) {
      const message = db2.select().from(messages).where((0, import_drizzle_orm24.eq)(messages.id, row.id)).get();
      if (!message) continue;
      const body = db2.select().from(messageBodies).where((0, import_drizzle_orm24.eq)(messageBodies.messageId, row.id)).get();
      const date = message.dateUtc ? new Date(message.dateUtc) : /* @__PURE__ */ new Date();
      const from = message.fromName ? `${message.fromName} <${message.fromEmail ?? ""}>` : message.fromEmail ?? "unknown@localhost";
      const headers = [
        `From: ${from}`,
        `To: ${addressLine(message.toJson)}`,
        `Subject: ${message.subject ?? ""}`,
        `Date: ${date.toUTCString()}`,
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=utf-8",
        ""
      ];
      out.write(`From clover ${date.toUTCString()}\r
`);
      out.write(`${headers.join("\r\n")}\r
${body?.textPlain ?? ""}\r
\r
`);
      count += 1;
    }
  }
  await new Promise((resolve) => out.end(() => resolve()));
  return { saved: true, path: result.filePath, count };
}
var import_node_fs6, import_drizzle_orm24;
var init_archive = __esm({
  "src/core/mail/archive.ts"() {
    "use strict";
    import_node_fs6 = require("node:fs");
    import_drizzle_orm24 = require("drizzle-orm");
    init_platform();
    init_db();
    init_schema();
    init_accounts();
    init_connection();
  }
});

// src/core/mail/drafts.ts
function buildRaw(draft) {
  const lines = [];
  const from = draft.fromEmail ? draft.fromName ? `"${draft.fromName}" <${draft.fromEmail}>` : draft.fromEmail : "";
  lines.push(`From: ${from}`);
  lines.push(`To: ${(draft.to ?? []).join(", ")}`);
  if (draft.cc?.length) lines.push(`Cc: ${draft.cc.join(", ")}`);
  if (draft.bcc?.length) lines.push(`Bcc: ${draft.bcc.join(", ")}`);
  lines.push(`Subject: ${draft.subject ?? ""}`);
  lines.push(`Date: ${(/* @__PURE__ */ new Date()).toUTCString()}`);
  lines.push("MIME-Version: 1.0");
  lines.push(draft.html ? "Content-Type: text/html; charset=utf-8" : "Content-Type: text/plain; charset=utf-8");
  lines.push("Content-Transfer-Encoding: 8bit");
  lines.push("");
  lines.push(draft.html ?? draft.text ?? "");
  return lines.join("\r\n");
}
function draftsFolder(accountId) {
  const list = getDb().select().from(folders).where((0, import_drizzle_orm25.eq)(folders.accountId, accountId)).all();
  return list.find((f) => f.specialUse === "drafts") ?? list.find((f) => inferSpecialUse(f.remotePath, f.name) === "drafts");
}
async function saveDraft(accountId, draft, existingUid) {
  const folder = draftsFolder(accountId);
  if (!folder) return null;
  const raw = Buffer.from(buildRaw(draft), "utf8");
  let uid = null;
  await withImap(accountId, async (client) => {
    await client.mailboxOpen(folder.remotePath);
    if (existingUid) {
      await client.messageDelete(String(existingUid), { uid: true }).catch(() => void 0);
    }
    const result = await client.append(folder.remotePath, raw, ["\\Draft"]);
    uid = result?.uid ?? null;
  });
  return uid;
}
async function deleteDraft(accountId, uid) {
  const folder = draftsFolder(accountId);
  if (!folder) return;
  await withImap(accountId, async (client) => {
    await client.mailboxOpen(folder.remotePath);
    await client.messageDelete(String(uid), { uid: true }).catch(() => void 0);
  });
}
var import_drizzle_orm25;
var init_drafts = __esm({
  "src/core/mail/drafts.ts"() {
    "use strict";
    import_drizzle_orm25 = require("drizzle-orm");
    init_db();
    init_schema();
    init_connection();
    init_specialUse();
  }
});

// src/mobile/engine/oauth.ts
function googleConfigured() {
  return false;
}
function microsoftConfigured() {
  return false;
}
function getGoogleConfig2() {
  return null;
}
function getMicrosoftConfig2() {
  return null;
}
function setGoogleConfig() {
}
function setMicrosoftConfig() {
}
async function startGoogleOAuth() {
  throw new Error(NOT_AVAILABLE);
}
async function startMicrosoftOAuth() {
  throw new Error(NOT_AVAILABLE);
}
var NOT_AVAILABLE;
var init_oauth = __esm({
  "src/mobile/engine/oauth.ts"() {
    "use strict";
    NOT_AVAILABLE = "Sign-in with Google/Microsoft is not available on Android yet \u2014 use an app password.";
  }
});

// src/core/mail/bulk.ts
function specialFolderId(accountId, use) {
  return getDb().select().from(folders).where((0, import_drizzle_orm26.and)((0, import_drizzle_orm26.eq)(folders.accountId, accountId), (0, import_drizzle_orm26.eq)(folders.specialUse, use))).get()?.id;
}
function targetFolderFor(accountId, action, targetFolderId) {
  if (action === "archive") return specialFolderId(accountId, "archive") ?? specialFolderId(accountId, "all");
  if (action === "trash") return specialFolderId(accountId, "trash");
  if (action === "move") return targetFolderId;
  return void 0;
}
async function moveGroup(group) {
  const db2 = getDb();
  const from = db2.select().from(folders).where((0, import_drizzle_orm26.eq)(folders.id, group.fromFolderId)).get();
  const to = db2.select().from(folders).where((0, import_drizzle_orm26.eq)(folders.id, group.toFolderId)).get();
  if (!from || !to) throw new Error("folder not found");
  if (protocolFor(group.accountId) !== "imap") {
    for (const item of group.items) {
      db2.update(messages).set({ folderId: group.toFolderId }).where((0, import_drizzle_orm26.eq)(messages.id, item.id)).run();
    }
    return group.items.map((item) => ({
      accountId: group.accountId,
      fromFolderId: group.fromFolderId,
      toFolderId: group.toFolderId,
      uid: item.uid,
      messageId: item.messageId
    }));
  }
  const response = await withImap(group.accountId, async (client) => {
    await client.mailboxOpen(from.remotePath);
    return client.messageMove(
      group.items.map((i) => i.uid),
      to.remotePath,
      { uid: true }
    );
  });
  const uidMap = response && response.uidMap ? response.uidMap : null;
  const undo = [];
  for (const item of group.items) {
    db2.delete(messages).where((0, import_drizzle_orm26.eq)(messages.id, item.id)).run();
    removeFromIndex(item.id);
    undo.push({
      accountId: group.accountId,
      fromFolderId: group.fromFolderId,
      toFolderId: group.toFolderId,
      uid: uidMap ? uidMap.get(item.uid) ?? null : null,
      messageId: item.messageId
    });
  }
  return undo;
}
async function bulkAction(input) {
  const result = { moved: 0, updated: 0, failed: 0 };
  const db2 = getDb();
  if (input.action === "archive" || input.action === "trash" || input.action === "move") {
    const groups = /* @__PURE__ */ new Map();
    for (const id of input.messageIds) {
      const row = db2.select().from(messages).where((0, import_drizzle_orm26.eq)(messages.id, id)).get();
      if (!row) {
        result.failed += 1;
        continue;
      }
      const toFolderId = targetFolderFor(row.accountId, input.action, input.targetFolderId);
      if (!toFolderId) {
        result.failed += 1;
        continue;
      }
      const key2 = `${row.accountId}\0${row.folderId}\0${toFolderId}`;
      const group = groups.get(key2) ?? {
        accountId: row.accountId,
        fromFolderId: row.folderId,
        toFolderId,
        items: []
      };
      group.items.push({ id, uid: row.uid, messageId: row.messageId });
      groups.set(key2, group);
    }
    const undo = [];
    for (const group of groups.values()) {
      try {
        undo.push(...await moveGroup(group));
        result.moved += group.items.length;
      } catch {
        result.failed += group.items.length;
      }
    }
    if (undo.length > 0) result.undo = undo;
    return result;
  }
  for (const id of input.messageIds) {
    try {
      const row = db2.select().from(messages).where((0, import_drizzle_orm26.eq)(messages.id, id)).get();
      if (!row) {
        result.failed += 1;
        continue;
      }
      if (input.action === "markRead") await setFlags(id, { seen: true });
      else if (input.action === "markUnread") await setFlags(id, { seen: false });
      else if (input.action === "markImportant") await setFlags(id, { important: true });
      else if (input.action === "markNotImportant") await setFlags(id, { important: false });
      result.updated += 1;
    } catch {
      result.failed += 1;
    }
  }
  return result;
}
async function undoMoves(moves) {
  const db2 = getDb();
  let restored2 = 0;
  let failed = 0;
  const folderIds = /* @__PURE__ */ new Set();
  const groups = /* @__PURE__ */ new Map();
  for (const move of moves) {
    const key2 = `${move.accountId}\0${move.toFolderId}\0${move.fromFolderId}`;
    const list = groups.get(key2) ?? [];
    list.push(move);
    groups.set(key2, list);
  }
  for (const group of groups.values()) {
    const first = group[0];
    const from = db2.select().from(folders).where((0, import_drizzle_orm26.eq)(folders.id, first.fromFolderId)).get();
    const to = db2.select().from(folders).where((0, import_drizzle_orm26.eq)(folders.id, first.toFolderId)).get();
    if (!from || !to) {
      failed += group.length;
      continue;
    }
    if (protocolFor(first.accountId) !== "imap") {
      for (const move of group) {
        const row = move.uid !== null ? db2.select().from(messages).where((0, import_drizzle_orm26.and)((0, import_drizzle_orm26.eq)(messages.folderId, move.toFolderId), (0, import_drizzle_orm26.eq)(messages.uid, move.uid))).get() : null;
        if (row) {
          db2.update(messages).set({ folderId: move.fromFolderId }).where((0, import_drizzle_orm26.eq)(messages.id, row.id)).run();
          restored2 += 1;
          folderIds.add(move.fromFolderId);
        } else failed += 1;
      }
      continue;
    }
    const movedUids = [];
    let missing = 0;
    const response = await withImap(first.accountId, async (client) => {
      await client.mailboxOpen(to.remotePath);
      for (const move of group) {
        if (move.uid !== null) {
          movedUids.push(move.uid);
        } else if (move.messageId) {
          const found = await client.search(
            { header: { "message-id": move.messageId } },
            { uid: true }
          );
          const list = Array.isArray(found) ? found : [];
          if (list.length) movedUids.push(Math.max(...list));
          else missing += 1;
        } else {
          missing += 1;
        }
      }
      if (movedUids.length === 0) return null;
      return client.messageMove(movedUids, from.remotePath, { uid: true });
    });
    if (response && response.uidMap) {
      markRecentlyRestored(first.accountId, first.fromFolderId, [...response.uidMap.values()]);
    }
    if (movedUids.length > 0) {
      const ghosts = db2.select({ id: messages.id }).from(messages).where((0, import_drizzle_orm26.and)((0, import_drizzle_orm26.eq)(messages.folderId, first.toFolderId), (0, import_drizzle_orm26.inArray)(messages.uid, movedUids))).all();
      for (const ghost of ghosts) {
        db2.delete(messages).where((0, import_drizzle_orm26.eq)(messages.id, ghost.id)).run();
        removeFromIndex(ghost.id);
      }
      restored2 += movedUids.length;
      folderIds.add(first.fromFolderId);
    }
    failed += missing;
  }
  return { restored: restored2, failed, folderIds: [...folderIds] };
}
async function emptyFolder(folderId) {
  const db2 = getDb();
  const folder = db2.select().from(folders).where((0, import_drizzle_orm26.eq)(folders.id, folderId)).get();
  if (!folder) return { deleted: 0 };
  const rows = db2.select({ id: messages.id, uid: messages.uid }).from(messages).where((0, import_drizzle_orm26.eq)(messages.folderId, folderId)).all();
  if (rows.length === 0) return { deleted: 0 };
  if (protocolFor(folder.accountId) === "imap") {
    await withImap(folder.accountId, async (client) => {
      await client.mailboxOpen(folder.remotePath);
      await client.messageDelete(
        rows.map((r) => r.uid),
        { uid: true }
      );
    });
    markRecentlyRemoved(folder.accountId, folderId, rows.map((r) => r.uid));
  }
  for (const row of rows) removeFromIndex(row.id);
  db2.delete(messages).where((0, import_drizzle_orm26.eq)(messages.folderId, folderId)).run();
  return { deleted: rows.length };
}
async function markFolderRead(folderId) {
  const db2 = getDb();
  const folder = db2.select().from(folders).where((0, import_drizzle_orm26.eq)(folders.id, folderId)).get();
  if (!folder) return 0;
  const rows = db2.select({ uid: messages.uid }).from(messages).where((0, import_drizzle_orm26.eq)(messages.folderId, folderId)).all();
  if (rows.length === 0) return 0;
  if (protocolFor(folder.accountId) === "imap") {
    await withImap(folder.accountId, async (client) => {
      await client.mailboxOpen(folder.remotePath);
      await client.messageFlagsAdd(
        rows.map((r) => r.uid),
        ["\\Seen"],
        { uid: true }
      );
    });
  }
  db2.update(messages).set({ isRead: true }).where((0, import_drizzle_orm26.eq)(messages.folderId, folderId)).run();
  return rows.length;
}
async function deleteSpam(accountId) {
  const db2 = getDb();
  const rows = db2.select({ id: messages.id, uid: messages.uid, folderId: messages.folderId }).from(messages).where((0, import_drizzle_orm26.and)((0, import_drizzle_orm26.eq)(messages.accountId, accountId), (0, import_drizzle_orm26.eq)(messages.isSpam, true))).all();
  if (rows.length === 0) return { deleted: 0 };
  const byFolder = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const list = byFolder.get(row.folderId) ?? [];
    list.push(row.uid);
    byFolder.set(row.folderId, list);
  }
  if (protocolFor(accountId) === "imap") {
    await withImap(accountId, async (client) => {
      for (const [folderId, uids] of byFolder) {
        const folder = db2.select().from(folders).where((0, import_drizzle_orm26.eq)(folders.id, folderId)).get();
        if (!folder) continue;
        await client.mailboxOpen(folder.remotePath);
        await client.messageDelete(uids, { uid: true });
        markRecentlyRemoved(accountId, folderId, uids);
      }
    });
  }
  for (const row of rows) removeFromIndex(row.id);
  db2.delete(messages).where((0, import_drizzle_orm26.and)((0, import_drizzle_orm26.eq)(messages.accountId, accountId), (0, import_drizzle_orm26.eq)(messages.isSpam, true))).run();
  return { deleted: rows.length };
}
var import_drizzle_orm26;
var init_bulk = __esm({
  "src/core/mail/bulk.ts"() {
    "use strict";
    import_drizzle_orm26 = require("drizzle-orm");
    init_db();
    init_schema();
    init_messages();
    init_connection();
    init_accounts();
    init_search();
    init_recentUids();
  }
});

// src/core/mail/idle.ts
async function connect(handle, emit) {
  if (handle.stopped) return;
  const account = getAccountById(handle.accountId);
  if (!account) return;
  const client = await buildAccountClient(handle.accountId);
  handle.client = client;
  client.on("error", () => void 0);
  try {
    await client.connect();
    await client.mailboxOpen("INBOX");
    client.on("exists", () => {
      void onNewMail(handle, emit);
    });
    if (handle.stopped) {
      await client.logout().catch(() => void 0);
      return;
    }
    while (!handle.stopped && client.usable) {
      try {
        await client.idle();
      } catch {
        break;
      }
    }
    if (!handle.stopped) reconnect(handle, emit);
  } catch {
    reconnect(handle, emit);
  }
}
async function onNewMail(handle, emit) {
  const inbox = getDb().select().from(folders).where((0, import_drizzle_orm27.and)((0, import_drizzle_orm27.eq)(folders.accountId, handle.accountId), (0, import_drizzle_orm27.eq)(folders.specialUse, "inbox"))).get();
  if (!inbox) return;
  try {
    await syncFolder(inbox.id, emit);
  } catch {
  }
  emit({ type: "mail:refresh", accountId: handle.accountId });
}
function reconnect(handle, emit) {
  if (handle.stopped) return;
  if (handle.reconnect) clearTimeout(handle.reconnect);
  handle.reconnect = setTimeout(() => void connect(handle, emit), 15e3);
}
function startIdle(accountId, emit) {
  if (handles.has(accountId)) return;
  const handle = { accountId, client: null, stopped: false };
  handles.set(accountId, handle);
  void connect(handle, emit);
}
function stopIdle(accountId) {
  const handle = handles.get(accountId);
  if (!handle) return;
  handle.stopped = true;
  if (handle.reconnect) clearTimeout(handle.reconnect);
  handle.client?.logout().catch(() => void 0);
  handles.delete(accountId);
}
function startAllIdle(emit) {
  for (const account of listAccounts()) {
    if (protocolFor(account.id) === "imap") startIdle(account.id, emit);
  }
}
var import_drizzle_orm27, handles;
var init_idle = __esm({
  "src/core/mail/idle.ts"() {
    "use strict";
    import_drizzle_orm27 = require("drizzle-orm");
    init_db();
    init_schema();
    init_accounts();
    init_auth();
    init_sync();
    handles = /* @__PURE__ */ new Map();
  }
});

// src/main/ipc/mail.ts
function registerMailIpc(getWindow) {
  const emit = createMailEmit(getWindow);
  ipcHost.handle(IpcChannels.mail.listAccounts, () => listAccounts());
  ipcHost.handle(IpcChannels.mail.createAccount, (_e, input) => {
    const account = createAccount(input);
    startIdle(account.id, emit);
    return account;
  });
  ipcHost.handle(
    IpcChannels.mail.updateAccount,
    (_e, id, input) => updateAccount(id, input)
  );
  ipcHost.handle(IpcChannels.mail.deleteAccount, (_e, id) => {
    stopIdle(id);
    deleteAccount(id);
  });
  ipcHost.handle(
    IpcChannels.mail.testConnection,
    async (_e, input) => {
      const result = { ok: false };
      const isPop = input.protocol === "pop3";
      try {
        result.imap = isPop ? await testPop3(input.incoming, {
          user: input.incoming.username,
          pass: input.password
        }) : await testImap(input.incoming, {
          user: input.incoming.username,
          pass: input.password
        });
      } catch (error) {
        result.error = `${isPop ? "POP3" : "IMAP"}: ${error.message}`;
        return result;
      }
      try {
        result.smtp = await testSmtp(input.outgoing, {
          user: input.outgoing.username,
          pass: input.password
        });
      } catch (error) {
        result.error = `SMTP: ${error.message}`;
        return result;
      }
      result.ok = true;
      return result;
    }
  );
  ipcHost.handle(
    IpcChannels.mail.syncAccount,
    (_e, accountId) => syncAccount(accountId, emit)
  );
  ipcHost.handle(
    IpcChannels.mail.syncFolder,
    (_e, folderId) => syncFolder(folderId, emit)
  );
  ipcHost.handle(IpcChannels.mail.listFolders, (_e, accountId) => listFolders(accountId));
  ipcHost.handle(
    IpcChannels.mail.listMessages,
    (_e, folderId, limit, offset) => listMessages(folderId, limit, offset)
  );
  ipcHost.handle(
    IpcChannels.mail.listThreads,
    (_e, folderId, limit) => listThreads(folderId, limit)
  );
  ipcHost.handle(
    IpcChannels.mail.hasOlderMessages,
    (_e, folderId, limit) => hasOlderMessages(folderId, limit)
  );
  ipcHost.handle(IpcChannels.mail.notificationStatus, (_e, ids) => messageStatuses(ids));
  ipcHost.handle(IpcChannels.mail.listJunk, (_e, accountId) => listJunk(accountId));
  ipcHost.handle(IpcChannels.mail.spamCount, (_e, accountId) => spamCount(accountId));
  ipcHost.handle(IpcChannels.mail.listImportant, (_e, accountId) => listImportant(accountId));
  ipcHost.handle(
    IpcChannels.mail.importantCount,
    (_e, accountId) => importantCount(accountId)
  );
  ipcHost.handle(
    IpcChannels.mail.listUnifiedThreads,
    (_e, limit) => listUnifiedThreads(limit)
  );
  ipcHost.handle(
    IpcChannels.mail.listUnifiedMessages,
    (_e, limit) => listUnifiedMessages(limit)
  );
  ipcHost.handle(IpcChannels.mail.markSpam, (_e, messageId) => markSpam(messageId));
  ipcHost.handle(IpcChannels.mail.markNotSpam, (_e, messageId) => markNotSpam(messageId));
  ipcHost.handle(
    IpcChannels.mail.blockSender,
    (_e, accountId, email) => setSenderKind(accountId, email, "block")
  );
  ipcHost.handle(
    IpcChannels.mail.allowSender,
    (_e, accountId, email) => setSenderKind(accountId, email, "allow")
  );
  ipcHost.handle(
    IpcChannels.mail.createFolder,
    (_e, input) => createFolder(input.accountId, input.name, input.parentRemotePath)
  );
  ipcHost.handle(
    IpcChannels.mail.renameFolder,
    (_e, folderId, newName) => renameFolder(folderId, newName)
  );
  ipcHost.handle(IpcChannels.mail.deleteFolder, (_e, folderId) => deleteFolder(folderId));
  ipcHost.handle(
    IpcChannels.mail.setFolderVisible,
    (_e, folderId, visible) => setFolderVisible(folderId, visible)
  );
  ipcHost.handle(IpcChannels.mail.exportMbox, (_e, folderId) => exportFolderMbox(folderId));
  ipcHost.handle(IpcChannels.mail.listAliases, (_e, accountId) => listAliases(accountId));
  ipcHost.handle(
    IpcChannels.mail.addAlias,
    (_e, accountId, email, name) => addAlias(accountId, email, name)
  );
  ipcHost.handle(IpcChannels.mail.deleteAlias, (_e, aliasId) => deleteAlias(aliasId));
  ipcHost.handle(IpcChannels.mail.getDefaultFrom, (_e, accountId) => getDefaultFrom(accountId));
  ipcHost.handle(
    IpcChannels.mail.setDefaultFrom,
    (_e, accountId, email) => setDefaultFrom(accountId, email)
  );
  ipcHost.handle(IpcChannels.mail.oauthStart, async () => {
    const account = await startGoogleOAuth();
    startIdle(account.id, emit);
    return account;
  });
  ipcHost.handle(IpcChannels.mail.oauthGoogleConfigured, () => googleConfigured());
  ipcHost.handle(IpcChannels.mail.oauthGetGoogleConfig, () => ({
    clientId: getGoogleConfig2().clientId
  }));
  ipcHost.handle(
    IpcChannels.mail.oauthSetGoogleConfig,
    (_e, clientId, clientSecret) => setGoogleConfig(clientId, clientSecret)
  );
  ipcHost.handle(IpcChannels.mail.oauthStartMicrosoft, async () => {
    const account = await startMicrosoftOAuth();
    startIdle(account.id, emit);
    return account;
  });
  ipcHost.handle(IpcChannels.mail.oauthMicrosoftConfigured, () => microsoftConfigured());
  ipcHost.handle(IpcChannels.mail.oauthGetMicrosoftConfig, () => ({
    clientId: getMicrosoftConfig2().clientId
  }));
  ipcHost.handle(
    IpcChannels.mail.oauthSetMicrosoftConfig,
    (_e, clientId, clientSecret) => setMicrosoftConfig(clientId, clientSecret)
  );
  ipcHost.handle(IpcChannels.mail.listRules, (_e, accountId) => listRules(accountId));
  ipcHost.handle(
    IpcChannels.mail.createRule,
    (_e, accountId, input) => createRule(accountId, input)
  );
  ipcHost.handle(
    IpcChannels.mail.updateRule,
    (_e, ruleId, input) => updateRule(ruleId, input)
  );
  ipcHost.handle(IpcChannels.mail.deleteRule, (_e, ruleId) => deleteRule(ruleId));
  ipcHost.handle(IpcChannels.mail.applyRules, (_e, accountId) => applyRules(accountId));
  ipcHost.handle(
    IpcChannels.mail.getMessage,
    (_e, messageId) => getMessageDetail(messageId)
  );
  ipcHost.handle(
    IpcChannels.mail.getConversation,
    (_e, messageId) => getConversation(messageId)
  );
  ipcHost.handle(
    IpcChannels.mail.setFlags,
    (_e, messageId, flags) => setFlags(messageId, flags)
  );
  ipcHost.handle(
    IpcChannels.mail.moveMessage,
    (_e, messageId, targetFolderId) => moveMessage(messageId, targetFolderId)
  );
  ipcHost.handle(
    IpcChannels.mail.deleteMessage,
    (_e, messageId) => deleteMessage(messageId)
  );
  ipcHost.handle(IpcChannels.mail.bulkAction, (_e, input) => bulkAction(input));
  ipcHost.handle(IpcChannels.mail.undoMoves, async (_e, moves) => {
    const result = await undoMoves(moves);
    for (const folderId of result.folderIds) {
      void syncFolder(folderId, emit).catch(() => void 0);
    }
    return { restored: result.restored, failed: result.failed };
  });
  ipcHost.handle(IpcChannels.mail.emptyFolder, (_e, folderId) => emptyFolder(folderId));
  ipcHost.handle(IpcChannels.mail.markFolderRead, (_e, folderId) => markFolderRead(folderId));
  ipcHost.handle(IpcChannels.mail.deleteSpam, (_e, accountId) => deleteSpam(accountId));
  ipcHost.handle(IpcChannels.mail.sendMessage, (_e, input) => sendNow(input));
  ipcHost.handle(IpcChannels.mail.outboxList, () => listOutbox());
  ipcHost.handle(IpcChannels.mail.outboxRetry, (_e, id) => retryOutbox(id));
  ipcHost.handle(IpcChannels.mail.outboxDiscard, (_e, id) => cancelOutbox(id));
  ipcHost.handle(
    IpcChannels.mail.saveDraft,
    (_e, accountId, draft, existingUid) => saveDraft(accountId, draft, existingUid)
  );
  ipcHost.handle(
    IpcChannels.mail.deleteDraft,
    (_e, accountId, uid) => deleteDraft(accountId, uid)
  );
  ipcHost.handle(
    IpcChannels.mail.downloadAttachment,
    (_e, attachmentId) => downloadAttachment(attachmentId)
  );
  ipcHost.handle(
    IpcChannels.mail.attachmentPath,
    (_e, attachmentId) => getAttachmentPath(attachmentId)
  );
  ipcHost.handle(
    IpcChannels.mail.openAttachment,
    (_e, attachmentId) => openAttachment(attachmentId)
  );
  ipcHost.handle(
    IpcChannels.mail.readAttachmentText,
    (_e, attachmentId) => readAttachmentText(attachmentId)
  );
  ipcHost.handle(
    IpcChannels.mail.search,
    (_e, query, accountId) => searchMessages(query, accountId)
  );
  ipcHost.handle(
    IpcChannels.mail.searchServer,
    (_e, accountId, query) => searchServer(accountId, query)
  );
  ipcHost.handle(IpcChannels.mail.listSnippets, () => listSnippets());
  ipcHost.handle(
    IpcChannels.mail.addSnippet,
    (_e, name, body) => addSnippet(name, body)
  );
  ipcHost.handle(IpcChannels.mail.deleteSnippet, (_e, id) => deleteSnippet(id));
  ipcHost.handle(
    IpcChannels.mail.snooze,
    (_e, messageId, untilMs) => snooze(messageId, untilMs)
  );
  ipcHost.handle(IpcChannels.mail.unsnooze, (_e, messageId) => unsnooze(messageId));
  ipcHost.handle(
    IpcChannels.mail.scheduleSend,
    (_e, payload, sendAt) => scheduleSend(payload, sendAt)
  );
  ipcHost.handle(IpcChannels.mail.listScheduled, () => listScheduled());
  ipcHost.handle(IpcChannels.mail.cancelScheduled, (_e, id) => cancelScheduled(id));
  ipcHost.handle(
    IpcChannels.mail.setThreadMuted,
    (_e, threadId, muted) => setThreadMuted(threadId, muted)
  );
  ipcHost.handle(
    IpcChannels.mail.setThreadPinned,
    (_e, threadId, pinned) => setThreadPinned(threadId, pinned)
  );
  ipcHost.handle(
    IpcChannels.mail.threadParticipants,
    (_e, messageId) => threadParticipants(messageId)
  );
  ipcHost.handle(IpcChannels.mail.listLabels, () => listLabels());
  ipcHost.handle(
    IpcChannels.mail.createLabel,
    (_e, name, color) => createLabel(name, color)
  );
  ipcHost.handle(IpcChannels.mail.deleteLabel, (_e, id) => deleteLabel(id));
  ipcHost.handle(
    IpcChannels.mail.addLabelToMessage,
    (_e, messageId, labelId) => addLabelToMessage(messageId, labelId)
  );
  ipcHost.handle(
    IpcChannels.mail.removeLabelFromMessage,
    (_e, messageId, labelId) => removeLabelFromMessage(messageId, labelId)
  );
  ipcHost.handle(
    IpcChannels.mail.listLabelMessages,
    (_e, labelId) => listLabelMessages(labelId)
  );
  ipcHost.handle(
    IpcChannels.mail.labelsForMessage,
    (_e, messageId) => labelIdsForMessage(messageId)
  );
  ipcHost.handle(IpcChannels.mail.listSavedSearches, () => listSavedSearches());
  ipcHost.handle(
    IpcChannels.mail.createSavedSearch,
    (_e, name, query) => createSavedSearch(name, query)
  );
  ipcHost.handle(IpcChannels.mail.deleteSavedSearch, (_e, id) => deleteSavedSearch(id));
  ipcHost.handle(IpcChannels.mail.importMbox, (_e, path) => importMboxFile(path));
  ipcHost.handle(IpcChannels.mail.pickImportMbox, () => pickAndImportMbox());
  startAllIdle(emit);
}
var init_mail = __esm({
  "src/main/ipc/mail.ts"() {
    "use strict";
    init_ipcHost();
    init_channels();
    init_accounts();
    init_imap();
    init_smtp();
    init_sync();
    init_queries();
    init_messages();
    init_outbox();
    init_search();
    init_snippets();
    init_snooze();
    init_schedules();
    init_threadSettings();
    init_labels();
    init_savedSearches();
    init_importMail();
    init_pop3();
    init_spam();
    init_folders();
    init_aliases();
    init_archive();
    init_drafts();
    init_oauth();
    init_bulk();
    init_idle();
    init_events();
    init_rules();
  }
});

// src/mobile/engine/register.ts
function registerAndroidHandlers(info) {
  ipcHost.handle(
    IpcChannels.appInfo,
    () => AppInfoSchema.parse({
      name: "Clover Mail",
      version: info.version,
      electron: "",
      chrome: "",
      node: process.versions.node,
      platform: process.platform,
      userDataPath: info.dataDir,
      isPackaged: true
    })
  );
  ipcHost.handle(IpcChannels.settingsGetAll, () => getAllSettings());
  ipcHost.handle(IpcChannels.settingsGet, (_e, key2) => getSetting(key2));
  ipcHost.handle(IpcChannels.settingsSet, (_e, key2, value) => {
    setSetting(key2, value);
  });
  ipcHost.handle(IpcChannels.settingsDelete, (_e, key2) => {
    deleteSetting(key2);
  });
  ipcHost.handle(IpcChannels.notificationsList, () => listNotifications());
  ipcHost.handle(
    IpcChannels.notificationsSave,
    (_e, items) => saveNotifications(items)
  );
  registerMailIpc(() => null);
}
var init_register = __esm({
  "src/mobile/engine/register.ts"() {
    "use strict";
    init_channels();
    init_ipc();
    init_settings();
    init_notifications();
    init_mail();
    init_ipcHost();
  }
});

// src/mobile/engine/e2e.ts
async function runE2eIfConfigured(dataDir) {
  const file = (0, import_node_path4.join)(__dirname, "e2e.json");
  if (!(0, import_node_fs7.existsSync)(file)) return;
  const cfg = JSON.parse((0, import_node_fs7.readFileSync)(file, "utf8"));
  const out = { ok: false };
  try {
    const account = await dispatch("mail:create-account", [
      {
        email: cfg.user,
        displayName: "E2E",
        incoming: { host: cfg.host, port: cfg.port, security: "none", username: cfg.user },
        outgoing: { host: cfg.host, port: 25, security: "none", username: cfg.user },
        password: cfg.pass
      }
    ]);
    out.accountId = account.id;
    await dispatch("mail:sync-account", [account.id]);
    const folders3 = await dispatch("mail:list-folders", [account.id]);
    out.folders = folders3.map((f) => f.name);
    const threads = await dispatch("mail:list-threads", [account.id]);
    out.threads = threads.length;
    const messages2 = await dispatch("mail:list-messages", [account.id]);
    out.messages = messages2.length;
    const search = await dispatch("mail:search", ["clover", account.id]);
    out.searchHits = Array.isArray(search) ? search.length : 0;
    const first = messages2[0];
    if (first) {
      const res = await dispatch("mail:bulk-action", [
        { messageIds: [first.id], action: "archive" }
      ]);
      const afterArchive = await dispatch("mail:list-messages", [account.id]);
      await dispatch("mail:undo-moves", [res.undo ?? []]);
      const afterUndo = await dispatch("mail:list-messages", [account.id]);
      out.archived = !afterArchive.some((m) => m.id === first.id);
      out.undoRestored = afterUndo.some((m) => m.id === first.id);
    }
    out.ok = out.messages > 0 && out.threads > 0;
  } catch (error) {
    out.error = error instanceof Error ? error.message : String(error);
  }
  const json = JSON.stringify(out);
  console.log(`CLOVER_E2E ${json}`);
  try {
    (0, import_node_fs7.writeFileSync)((0, import_node_path4.join)(dataDir, "e2e-result.json"), json);
  } catch {
  }
}
var import_node_fs7, import_node_path4;
var init_e2e = __esm({
  "src/mobile/engine/e2e.ts"() {
    "use strict";
    import_node_fs7 = require("node:fs");
    import_node_path4 = require("node:path");
    init_registry();
  }
});

// src/mobile/engine/main.ts
var main_exports = {};
__export(main_exports, {
  startEngine: () => startEngine
});
function startEngine(bridge2) {
  process.env.CLOVER_DB_DRIVER = "wasm";
  const dataDir = bridge2.app.datadir();
  console.log(`CLOVER_ENGINE_DATADIR ${dataDir}`);
  setPlatform(androidPlatform());
  setMailPoster((channel, payload) => bridge2.channel.post("event", { channel, payload }));
  initDatabase(dataDir);
  setStorageRoot((0, import_node_path5.join)(dataDir, "attachments"));
  registerAndroidHandlers({ version: "0.4.75", dataDir });
  bridge2.channel.on("invoke", (msg) => {
    void (async () => {
      const { id, channel, args } = msg;
      try {
        const result = await dispatch(channel, args);
        bridge2.channel.post("reply", { id, ok: true, result });
      } catch (error) {
        bridge2.channel.post("reply", {
          id,
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    })();
  });
  bridge2.channel.post("ready");
  console.log("CLOVER_ENGINE_READY");
  void runE2eIfConfigured(dataDir);
}
var import_node_path5;
var init_main = __esm({
  "src/mobile/engine/main.ts"() {
    "use strict";
    import_node_path5 = require("node:path");
    init_db();
    init_storage();
    init_platform();
    init_registry();
    init_platform2();
    init_events();
    init_register();
    init_e2e();
  }
});

// src/mobile/engine/index.ts
var bridge = require_bridge_stub();
console.log("CLOVER_ENGINE_BOOT");
var loadError = null;
try {
  const { startEngine: startEngine2 } = (init_main(), __toCommonJS(main_exports));
  startEngine2(bridge);
} catch (error) {
  loadError = error instanceof Error ? `${error.message}
${error.stack ?? ""}` : String(error);
  console.log(`CLOVER_ENGINE_LOAD_ERROR ${loadError}`);
}
if (loadError) {
  bridge.channel.on("invoke", (msg) => {
    const { id } = msg;
    bridge.channel.post("reply", { id, ok: false, error: `engine failed to load: ${loadError}` });
  });
}
