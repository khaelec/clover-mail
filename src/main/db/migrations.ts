export interface Migration {
  id: string
  sql: string
}

/**
 * Ordered, idempotent migrations. Each entry is applied once and recorded in
 * __migrations. Keep statements idempotent (IF NOT EXISTS) so a partial run is
 * always safe to resume.
 */
export const migrations: Migration[] = [
  {
    id: '0000_init',
    sql: `
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `
  },
  {
    id: '0001_mail',
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
    id: '0002_message_richness',
    sql: `
      ALTER TABLE attachments ADD COLUMN content_path TEXT;
    `
  },
  {
    id: '0003_spam',
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
    id: '0004_rules',
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
    id: '0005_custom_apps',
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
    id: '0006_calendar',
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
  }
]
