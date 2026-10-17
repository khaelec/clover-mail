# Clover Mail — planned features

Remaining work toward an Outlook-level mail client. Last updated with 0.4.92
(2026-10-17). Each section is in priority order. When an item ships, move it to
the CHANGELOG and delete it here.

## Next up

1. **Keyboard shortcuts in pop-out windows.** Check that the pop-out message and
   compose windows handle the usual keys (Ctrl+R reply, Ctrl+Enter send,
   Delete, Ctrl+P print, Escape close), and wire up any that don't.
2. **Find why Gmail drops connections.** 0.4.89 logs the server's reason
   (`[imap] … server ended the session (…)` in
   `%APPDATA%\clover-mail\logs\main.log`). Read those lines after the next
   "Connection not available" sync error, then fix the cause instead of only
   recovering from it.
3. **Images in compose.** Paste or drag an image into the message body,
   inline (cid:). Today you can only attach files.
4. **Notification sound** (optional, with a setting) and a per-account
   "notify me" switch.
5. **Unsubscribe on older mail.** The link only appears for messages first
   opened on 0.4.91 or later. Fill it in for already-cached messages, either
   one batch at a time or the next time each one is opened.

## Missing compared with Outlook

**Mail**
- Automatic replies (out of office). Gmail needs its settings API; IMAP-only
  servers can't do it, or need a Sieve vacation rule.
- Read receipts (request, and answer a request).
- Templates: whole messages with a subject, beyond the current snippets.
- Quick steps: one click for several actions, e.g. "move to Done and mark
  read".
- Categories: coloured tags. Labels mostly cover this; decide whether to
  rename and recolour them instead of adding something new.
- Attachment preview inside the app for PDFs, images and Office files.
  Today they open in the system viewer.
- Zoom for the message being read (Ctrl + scroll / Ctrl +/-).
- Conversation order setting (newest first or oldest first).
- Recall / "undo send" for longer than the current 8-second window. Outbox
  delay as a setting.
- Focused / Other inbox split.

**Calendar**
- Accept, tentative and decline for meeting invites, with the reply sent to
  the organizer.
- Check how complete CalDAV sync is (two-way edits, deletions,
  recurrence exceptions) against Google and iCloud.

**Contacts**
- Sync with Google Contacts (People API) and CardDAV. The address book is
  local only today, built from mail plus imports.
- Contact photos.

**Accounts**
- Microsoft 365 / Exchange through Microsoft Graph. Today Microsoft
  accounts sign in with OAuth but use IMAP.

**App**
- Keyboard shortcut customisation.
- Accessibility pass: screen-reader labels on every control, focus order in
  the pop-out windows, high-contrast theme.

## Known issues and things not yet verified

- **Save as file (.eml)** is only tested on local/imported mail, where it
  correctly refuses. Not yet tested against a real IMAP server.
- **The same draft open in two places:** if a draft is edited in the main
  window and then double-clicked, both copies stay open. Clicking away
  first avoids it.
- **Bell alerts created before 0.4.92** only track their newest message, so
  a grouped one from then clears only when that message is read.
- **The compose window reloads into a closed state** if it is reloaded
  (Ctrl+R): the draft is saved first, then the window closes. Low priority.

## Shipped in this push (0.4.83 – 0.4.92)

- Sync and IDLE recover after sleep, wake and connection drops. Read and flag
  changes from other devices come in (CONDSTORE).
- Clicking a notification opens the message.
- Address autocomplete, recipient chips, an address book (People),
  contact groups, vCard/CSV import and export.
- Messages being written are never lost. Drafts save only when something
  changed. Discard button.
- Pop-out windows for reading (double-click), for writing (pop-out button)
  and for drafts (double-click).
- Print, Save as .eml, Unsubscribe.
- Search filters panel. Server search uses AND.
- The bell clears itself when mail is read anywhere.
- IMAP drop reasons are logged.
