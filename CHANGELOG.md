# Changelog

Notable changes, newest first. Releases are batched (roughly daily or per
feature; hotfixes immediately) and the in-app updater reads GitHub Releases, so a
version only reaches users when its release exists on GitHub.

## 0.4.76

### Fix
- Right-click → **Move to folder** works again in conversation view. The
  conversation menu now has a "Move to folder ›" list; it moves the copies in
  the folder you're viewing (so on Gmail your replies keep their Sent label),
  and Undo works as for other moves.

## 0.4.74 – 0.4.77

### Attachments
- Right-click an image attachment and choose **Copy image** to copy it straight
  to the clipboard — no need to open it in an external app. *(0.4.77)*

### Removed
- The experimental "Mobile access" setting, which served Clover Mail over the
  LAN for a phone to connect to. *(0.4.74)*

### Internal
- The mail engine now opens its database through a small driver layer (no
  behaviour change). *(0.4.75)*

## 0.4.67 – 0.4.73

### Notification bell
- The bell panel is drawn above the whole window (it could be clipped by the
  title bar). *(0.4.67)*
- The unread count now stays accurate — after each sync, items are cleared when
  their message is read elsewhere and dropped when it was deleted on the server —
  and the bell survives restarts (the last 50 items are stored). *(0.4.68)*
- Each item is actionable (mail: Archive / Mark read / Reply, with Undo) with a
  per-item dismiss; the header has Mark all read, Clear and a Do Not Disturb
  toggle; and there's a proper empty state. *(0.4.69)*
- More sources feed the bell: calendar reminders, outbox send failures and
  snoozed mail returning (pushed from the main process), plus sync errors and
  update notices — each opens the right screen. *(0.4.70)*

### Conversations & reply
- A message a server files in several folders (Gmail's Inbox + All Mail +
  Important) now shows once, with correct counts; Trash/Junk copies stay out of
  Inbox conversations. *(0.4.71)*
- Reply all now covers the whole conversation (From/To/Cc across every message,
  minus you); the Cc field shows automatically and account aliases count as you,
  so it can't end up replying to just yourself. *(0.4.71, 0.4.72)*

## 0.4.38 – 0.4.66

### Reader & privacy
- Remote content in messages is now blocked with a Content-Security-Policy inside
  the message frame, covering `srcset`, `<picture>`/`<source>`, video `poster`,
  CSS `background-image`, the `background=` attribute and `@font-face` — not just
  `<img src>` — so tracking pixels can't leak your IP. Remote URLs that appear only
  in a `<style>` block are counted too, so "Load images" is offered whenever any
  are present. *(0.4.38, 0.4.45)*

### Sync & correctness
- Syncs no longer overlap: a second trigger joins the running sync (getting its
  real result or error) and the focus-triggered sync is throttled. *(0.4.39, 0.4.41)*
- Mail deleted or moved by another client now disappears on the next sync, with
  guardrails (skip when nothing changed; a failed lookup deletes nothing; a
  suspicious mass deletion is confirmed first). *(0.4.55, 0.4.56)*
- Messages the cache is missing are re-fetched, repairing an accidental removal or
  a partial fetch. *(0.4.60)*
- Fixed the main-process crash on an IMAP socket timeout. *(0.4.57)*

### Notifications
- The bell is read-driven: mail notifications clear when you open the message, and
  clicking one opens the conversation. *(0.4.40)*
- Notifications now come from any sync, not only IMAP IDLE, and only announce the
  messages a sync actually fetched (skipping read/spam/muted mail and messages you
  just restored with Undo). Bursts collapse into one item; duplicates are dropped.
  *(0.4.58, 0.4.59)*
- Embedded apps that run in the background capture their own notifications (sender
  and preview; click to open the chat), with per-app settings and All/Mail/Apps
  filters. *(0.4.61, 0.4.62)*

### Performance
- The message list no longer re-renders on every sync status update; rows are
  memoized and keep their identity across reloads. Selecting a message re-renders
  only the rows that changed, and off-screen rows skip layout/paint. *(0.4.43)*
- Bulk archive/move/delete and Undo are much faster (one `MOVE` per folder group;
  folder syncs reuse the shared connection; Undo returns immediately). *(0.4.54)*

### UI
- Toasts with **Undo** for archive, move, delete-to-Trash and label changes. *(0.4.44)*
- Keyboard shortcuts (`e`/`#`/`s`/`u`/`Shift+R`/`f`/`?`/`Esc`) with a cheat sheet. *(0.4.46)*
- Per-account sync status dots (syncing / synced / error). *(0.4.47)*
- **Load older messages** for folders larger than the list window. *(0.4.63)*
- Accessibility: focus rings, labels on icon-only buttons, listbox roles, and
  focus trapping in dialogs. *(0.4.48)*

### Security
- A Content-Security-Policy on the main window, `clover-media://` restricted to the
  app's folders, and the main window now runs **sandboxed**. *(0.4.42, 0.4.53)*

### Maintenance
- CI on every push (typecheck + IPC contract check) and a Dovecot-backed IMAP
  integration test. *(0.4.49, 0.4.60)*
- Main-process log (`logs/main.log`) with sync/reconcile detail; "Copy diagnostics"
  in Settings → About (email addresses redacted). *(0.4.57, 0.4.58)*
- Attachment files no longer referenced by any message are quarantined (recoverable
  for 30 days), with guards against sweeping a damaged database. *(0.4.65, 0.4.66)*
- Fixed creating folders on local (imported) accounts. *(0.4.64)*
- Split `MailView` and `SettingsView` into components (no behaviour change).
  *(0.4.51, 0.4.52)*

## Earlier

History before 0.4.38 is in the git log and the GitHub releases.
