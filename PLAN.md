# Clover Mail — Build Plan

A Mailbird-inspired email client for Windows with four differentiating features:

1. **Live wallpapers** — Wallpaper Engine wallpapers and video wallpapers as the app background.
2. **AI copilot** — connect to Claude and to opencode.
3. **Custom apps** — embed your own apps, including your PWA IT app.
4. **Calendar + ICS** — open and add `.ics` files to the calendar.

This document is the master plan: stack, architecture, data model, feature specs, and a phased roadmap. It is informed by static analysis of Mailbird 4.35.1 (see `APPENDIX: Mailbird findings`).

---

## 1. Goals & non-goals

### Goals (v1)
- A real, usable email client on Windows: IMAP + SMTP, multiple accounts, folders, threaded conversations, compose, search.
- The four signature features above, designed in from the start rather than bolted on.
- A clean extension model so new "apps", wallpapers, and AI tools plug in without core rewrites.
- Local-first storage; no dependency on a Clover Mail cloud service to function.

### Non-goals (v1)
- macOS/Linux (architecture stays portable, but only Windows is tested/shipped).
- POP3 (schema leaves room; UI deferred), Exchange/EWS, Gmail/Microsoft OAuth (Phase 1.5).
- Mobile, collaboration/multi-user, plugin marketplace.
- Calendar sync-back to remote servers (CalDAV/ICS out only in v1).

---

## 2. Stack decisions

| Concern | Choice | Why |
|---|---|---|
| Shell | **Electron** (current stable, pinned) | Embeds Chromium → PWA apps, video wallpapers, HTML wallpapers; easy to spawn `claude`/`opencode`; mirrors Mailbird's CEF model. |
| Language | **TypeScript** everywhere | Safety across IPC, DB, and shared types. |
| UI | **React 18** + **Vite** via `electron-vite` | Fast HMR, mature ecosystem. |
| State | **Zustand** (+ React Query for async) | Simple, no boilerplate. |
| Styling | **Tailwind CSS** | Rapid iteration, theming. |
| Storage | **SQLite** via `better-sqlite3` + **Drizzle ORM** (migrations) | Fast synchronous local DB; FTS5 support; Drizzle gives typed schema + migrations. |
| Search | SQLite **FTS5** virtual table | Same approach Mailbird uses (`MessageSearchIndex`). |
| IMAP | `imapflow` | Modern, promise-based, IDLE support. |
| SMTP | `nodemailer` | Standard, robust. |
| MIME parse | `mailparser` | Enables text/calendar + attachment detection. |
| ICS/Cal | `ical.js` (+ `node-ical` fallback) | Industry-standard ICS parsing/recurrence. |
| Recurrence/TZ | `rrule` + `date-fns-tz` (or Temporal polyfill) | RRULE expansion and timezone-correct scheduling. |
| AI (Claude) | `@anthropic-ai/sdk` + spawn `claude` CLI | API chat panel + Claude Code integration. |
| AI (opencode) | `opencode` server mode / SDK | Embedded agent workspace bound to a folder. |
| MCP | `@modelcontextprotocol/sdk` | Expose Clover Mail tools; consume external servers. |
| Packaging | `electron-builder` (NSIS) | Windows installer. |
| Updates | `electron-updater` (deferred to Phase 6) | Auto-update later. |

**Pinned decisions:** Node ≥ 20 LTS for the toolchain, Electron current stable, single-window main UI with optional secondary windows (compose, app windows).

---

## 3. Architecture

### 3.1 Process model (inspired by Mailbird's 3-process split)
```
┌──────────────────────────────────────────────────────────────┐
│ Main process (Node)                                          │
│  - app lifecycle, windows, menus, tray                       │
│  - SQLite (better-sqlite3) + migrations                      │
│  - Mail sync workers (per account), Send queue               │
│  - Calendar services, ICS import/export                      │
│  - Custom App manager (webview partitions, PWA discovery)    │
│  - Wallpaper manager                                         │
│  - AI bridge (Anthropic SDK, claude/opencode process spawn)  │
│  - Clover Mail MCP server (local HTTP/stdio)                 │
│  - IPC router (typed channels, zod-validated)                │
└───────────────▲───────────────────────────────┬──────────────┘
                │ typed IPC (contextBridge)      │ spawns / manages
┌───────────────┴───────────────┐   ┌────────────┴─────────────────────────┐
│ Preload (contextBridge)       │   │ Child processes / targets            │
│  - expose whitelisted API     │   │  - <webview> custom apps (partitioned)│
└───────────────▲───────────────┘   │  - wallpaper layer (<video>/<webview>)│
                │                   │  - claude CLI / opencode server       │
┌───────────────┴───────────────┐   │  - MCP clients (external servers)     │
│ Renderer (React)              │   └───────────────────────────────────────┘
│  - Mail UI, Calendar UI       │
│  - Apps sidebar               │
│  - Wallpaper layer (z-under)  │
│  - AI panel                   │
└───────────────────────────────┘
```

### 3.2 Layering rules
- **Renderer never touches Node/DB directly** — all access via typed IPC.
- **One owner per data domain** in main: `mail`, `calendar`, `apps`, `wallpaper`, `ai`, `settings`. Each exposes a small module API to the IPC router.
- **No secret in renderer.** OAuth tokens / API keys live in main, encrypted via Windows DPAPI (`safeStorage`).
- **Webviews are sandboxed** and use persistent session partitions; external navigation is intercepted.

### 3.3 Proposed directory layout
```
E:\Email App
├─ PLAN.md
├─ package.json
├─ electron.vite.config.ts
├─ tsconfig.json
├─ drizzle.config.ts
├─ migrations/                     # generated SQL migrations
├─ resources/                      # icons, built-in wallpaper samples, seed ICS
└─ src/
   ├─ main/
   │  ├─ index.ts                  # app bootstrap
   │  ├─ windows/                  # main, compose, app-window factories
   │  ├─ ipc/                      # typed router + channel contracts
   │  ├─ db/                       # drizzle client, schema, migrations runner
   │  ├─ mail/                     # accounts, imap, smtp, sync, send, parse
   │  ├─ calendar/                 # events, recurrence, ics import/export
   │  ├─ apps/                     # custom web app + PWA manager
   │  ├─ wallpaper/                # wallpaper sources + WE integration
   │  ├─ ai/                       # claude, opencode, mcp client/server
   │  └─ settings/                 # settings + secrets (DPAPI)
   ├─ preload/
   │  └─ index.ts                  # contextBridge API surface
   ├─ renderer/
   │  ├─ index.html
   │  └─ src/
   │     ├─ app/                   # shell, routing, layout
   │     ├─ features/
   │     │  ├─ mail/  apps/  wallpaper/  calendar/  ai/
   │     ├─ state/                 # zustand stores
   │     └─ styles/
   └─ shared/                      # types + zod schemas shared main<->renderer
```

---

## 4. Data model (SQLite / Drizzle)

Modeled on Mailbird's proven entity set, renamed to clean snake_case. FTS5 for search.

### Core / accounts
- `accounts(id, email, display_name, kind, color, is_enabled, created_at)`
- `account_aliases(id, account_id, email, display_name)`
- `sender_identities(id, account_id, name, email, signature_id)`
- `incoming_settings(id, account_id, protocol, host, port, security, username, secret_ref)`
- `outgoing_settings(id, account_id, host, port, security, username, secret_ref)`
- `pop3_settings(id, account_id, ...)` (deferred UI)
- `oauth2_credentials(id, account_id, provider, access_token_ref, refresh_token_ref, expiry, scope)`

### Mail store
- `folders(id, account_id, remote_path, name, kind, unread_count, total_count, uidvalidity)`
- `messages(id, account_id, folder_id, uid, message_id, in_reply_to, references, subject, from_name, from_email, to_json, cc_json, bcc_json, date_utc, size, is_read, is_flagged, is_draft, has_attachments, snippet, thread_id)`
- `message_bodies(id, message_id, text_plain, html_sanitized, raw_ref, fetched_at)`
- `folders_messages(message_id, folder_id)`  (label/multi-folder)
- `attachments(id, message_id, filename, mime_type, size, content_id, is_inline, blob_ref)`
- `message_references(id, message_id, ref_message_id)`
- `contacts(id, email, display_name)` + `message_contacts(message_id, contact_id, kind)`
- `conversation_summaries(thread_id, account_id, subject, last_date, message_count, unread_count, participants_json)`
- `signatures(id, account_id, name, html)` / `snippets(id, name, body)`

### Filters
- `filters(id, account_id, name, is_enabled, match_all, sort_order)`
- `filter_conditions(id, filter_id, field, op, value)`
- `filter_actions(id, filter_id, action, value)`

### Contacts (local address book)
- `user_contacts`, `user_contact_fields`, `user_contact_groups`, `user_contact_accounts`, `user_contact_postal_addresses`, `user_contact_groups_user_contacts`

### Calendar
- `calendar_accounts(id, account_id, provider, name, color)`
- `calendars(id, calendar_account_id, name, color, is_visible)`
- `calendar_events(id, calendar_id, uid, sequence, summary, description, location, start_utc, end_utc, is_all_day, tzid, organizer_json, status, transp, created_utc, last_modified_utc)`
- `calendar_event_recurrences(id, event_id, rrule, exdate_json, rdate_json, recurrence_id)`
- `calendar_event_attendees(id, event_id, email, name, role, partstat)`
- `calendar_reminders(id, event_id, minutes_before, method)`
- `calendar_acl_rules(id, calendar_id, principal, role)`

### Feature tables
- `custom_web_apps(id, name, url, manifest_url, icon_ref, partition, window_mode, sort_order, is_pinned, created_at)`  ← feature 3
- `installed_apps(id, app_id, installed_at)`  ← feature 3 sidebar state
- `wallpapers(id, name, kind, source_ref, options_json, is_active, sort_order)`  ← feature 1
- `ai_sessions(id, kind, provider, title, workspace_path, created_at)` + `ai_messages(id, session_id, role, content, tokens, created_at)`  ← feature 2
- `mcp_settings(enabled, port, auth_token_ref, write_tools_granted, log_requests)`  ← feature 2
- `app_settings(key, value_json)`

### Search
- `messages_fts` — FTS5 over `(subject, from_name, from_email, snippet, body_text)`, kept in sync by triggers or explicit indexing in the same transaction as inserts.
- `entity_search` — optional lightweight FTS over contacts, apps, calendar.

### Migrations
- Drizzle-kit generates numbered SQL under `migrations/`. Runner applies on startup in a transaction, records in `__migrations`. Keep an `__EFMigrations`-style audit table for debuggability.

---

## 5. Feature specifications

### Feature 1 — Live wallpapers (Wallpaper Engine + video)
**Sources supported:**
- `video` — local `.mp4`/`.webm`/`.mkv`, muted, looped, cover-fit.
- `gif` — animated GIF/APNG.
- `slideshow` — folder of images with interval + crossfade.
- `html` — local or remote HTML/JS wallpaper (for Wallpaper Engine web wallpapers).
- `wallpaper-engine` — integration with a running Wallpaper Engine instance.

**Rendering:** a dedicated full-bleed layer *behind* the translucent app chrome.
- Implement as the lowest z-layer of the main `BrowserWindow` (`<video>`/`<canvas>`/`<webview>`), with the UI drawn above over translucent surfaces.
- Controls: per-workspace wallpaper, opacity, blur, dim overlay, fit (cover/contain/tile), playback speed, "pause when minimized/unfocused", "mute".
- Performance: cap decode resolution, hardware-accelerated `<video>`, pause rendering when window hidden, honor Windows "reduce motion"/battery.

**Wallpaper Engine integration (conditional — verify API at implementation time):**
- WE exposes a local Web API when enabled in its settings (localhost). Endpoints to query the current wallpaper and control playback (next/previous/pause).
- Integration surface: (a) read current WE wallpaper metadata, (b) remote-control WE playback, (c) allow WE *web wallpapers* to run inside our `html` layer via the WE web API (`window.wallpaperPropertyListener` shim).
- Fallback if the API is unavailable: let the user point at a WE wallpaper folder and auto-detect its underlying video/HTML asset, then play it directly in our own layer.
- **Unknowns to validate on-device:** exact WE version, whether the Web API is enabled by default, exact endpoint/port, and licensing constraints on reusing workshop content. Treat WE as "best-effort integration," with native video/HTML wallpapers as the guaranteed path.

**Acceptance:** user can set a video/HTML/WE wallpaper, tune opacity/blur, and it persists per workspace and survives restart.

---

### Feature 2 — AI copilot (Claude + opencode)
Two independent providers behind one panel.

**Claude:**
- Chat panel using `@anthropic-ai/sdk`; key stored via DPAPI in main.
- Context menu actions on a message/thread: *Summarize*, *Draft reply*, *Extract tasks*, *Find ICS/invite*, *Explain*.
- Optionally spawn the `claude` CLI for Claude Code-style agentic edits in the user's workspace.

**opencode:**
- Launch `opencode` in server mode (or via SDK) bound to a chosen workspace folder.
- Embedded terminal/agent panel; stream output; open files from mail attachments into the workspace.
- Session records stored in `ai_sessions`/`ai_messages`.

**MCP (both directions):**
- **Server:** Clover Mail exposes an MCP server (mirror Mailbird's `McpSettings`: enabled, port, auth token, `writeToolsGranted`, `logRequests`). Tools (read by default; writes gated): `list_folders`, `search_messages`, `read_message`, `create_draft`, `send_draft` (write), `add_calendar_event` (write), `import_ics` (write).
- **Client:** consume external MCP servers so the panel can use extra tools.
- Security: bind to `127.0.0.1`, require the auth token, write tools off by default, log requests when enabled.

**Acceptance:** ask Claude to summarize the selected thread; run an opencode session against a folder; connect Claude Desktop to Clover Mail's MCP server and have it list/search mail.

---

### Feature 3 — Custom apps (your PWA IT app)
- **Apps sidebar** listing installed apps (mirrors Mailbird's `CustomWebApp` + `InstalledApps`).
- **Add app:** paste a URL → discover web app manifest (`/manifest.webmanifest`, `<link rel="manifest">`) → capture name, icons, `start_url`, theme color; fallback to page title + favicon.
- **Render:** `<webview>` with a **persistent session partition per app** (`persist:app-<id>`), `contextIsolation: true`, `nodeIntegration: false`, sandboxed. Handle downloads, notifications, `setWindowOpenHandler` for external links, and an "Open in app window" mode.
- **Icon capture:** cache icons in `resources/app-icons/<id>`; allow manual override.
- **Security:** URL allowlist per app; block `file://` navigation; strip permissions by default (opt-in camera/mic/geo).
- **Seed:** ship an "Add your IT app" empty slot; user pastes their PWA URL.

**Acceptance:** add the IT PWA by URL → it appears in the sidebar with its icon and loads in an isolated, persistent session; state survives restart.

---

### Feature 4 — Calendar + ICS
- **Calendar UI:** month / week / day / agenda views; multiple calendars with colors; create/edit/delete events.
- **ICS import:**
  - Drag-drop or file-picker `.ics`/`.ical`.
  - Parse `VCALENDAR` → `VEVENT`/`VTODO`/`VJOURNAL` + `VALARM` + `RRULE`/`RDATE`/`EXDATE` (`ical.js`).
  - Map to `calendar_events` + recurrence/attendee/reminder tables; **dedupe by `UID` + `SEQUENCE`**, update on re-import, honor `STATUS:CANCELLED`.
  - Timezone-correct start/end (`TZID`, UTC, all-day).
- **ICS from email:** `mailparser` surfaces `text/calendar` parts and `.ics` attachments → "Add to Calendar" button on the message, with RSVP (`PARTSTAT=ACCEPTED/DECLINED/TENTATIVE`) written back as a response draft.
- **ICS export:** export a selected event/calendar/range to `.ics`.
- **Recurrence:** expand via `rrule` for display; store the rule, materialize occurrences in the view layer.

**Acceptance:** drop a multi-event `.ics` (with recurrence + timezones) → events appear correctly; open an emailed invite → add it and produce an RSVP.

---

## 6. Roadmap & milestones

Each phase ends with a shippable, testable increment. Tasks list the concrete work; acceptance criteria gate the phase.

### Phase 0 — Foundation
- Scaffold `electron-vite` + TS + React + Tailwind; app shell (sidebar / list / reader / status).
- `better-sqlite3` + Drizzle; migration runner; `app_settings`.
- Typed IPC router + preload `contextBridge`; zod-validated contracts in `src/shared`.
- Secrets via Windows DPAPI (`safeStorage`).
- Local `git init`; `.gitignore`; **no remote push until project complete.**
- **Accept:** app launches, creates the SQLite file, reads/writes a setting through IPC.

### Phase 1 — Mail core (IMAP/SMTP)
- Account onboarding UI; connection test (IMAP + SMTP autodiscovery).
- `imapflow` sync workers (INBOX + folders, UIDVALIDITY, flags, IDLE), `nodemailer` send queue.
- Folder tree, message list (virtualized), conversation grouping, reader (sanitized HTML), attachments.
- Compose window (to/cc/bcc, HTML, attachments, signature, save-draft to IMAP).
- FTS5 indexing + search UI.
- **Accept:** add a real IMAP account, receive/send mail, search it, survive restart.

### Phase 1.5 — OAuth providers
- Gmail (`googleapis`) and Microsoft (`@azure/msal-node`) OAuth2 flows, XOAUTH2 for IMAP/SMTP.
- **Accept:** connect Gmail and Outlook accounts end to end.

### Phase 2 — Custom apps (feature 3)
- `custom_web_apps` schema + manager; sidebar UI; add-by-URL with manifest discovery; icon capture.
- `<webview>` host with partitioned sessions, window/space management, security policy.
- **Accept:** add the IT PWA; loads isolated and persistent.

### Phase 3 — Live wallpapers (feature 1)
- Wallpaper layer + controls (video/gif/slideshow/html); options persistence.
- Wallpaper Engine integration (best-effort) with video fallback.
- Perf guards (pause when hidden, resolution cap).
- **Accept:** set a video and an HTML wallpaper; tune and persist.

### Phase 4 — Calendar + ICS (feature 4)
- Calendar schema/services; month/week/day/agenda UI; CRUD.
- ICS import (file/drag-drop), dedupe, recurrence, TZ; ICS export.
- Email-invite detection + "Add to Calendar" + RSVP.
- **Accept:** import a complex `.ics`; add an emailed invite and RSVP.

### Phase 5 — AI copilot (feature 2)
- Claude panel + per-message actions; opencode session panel.
- MCP client + Clover Mail MCP server with write-gating.
- **Accept:** summarize a thread with Claude; run opencode on a folder; connect an external MCP client.

### Phase 6 — Polish & packaging
- `electron-builder` NSIS installer; signed build; auto-update via `electron-updater`.
- Theming, accessibility, keyboard shortcuts, performance pass, crash reporting (optional, opt-in).
- **Accept:** clean install/upgrade on a fresh Windows profile.

---

## 7. Cross-cutting concerns

- **Security:** contextIsolation + sandbox for all web contents; strict IPC allowlist; `safeStorage` for secrets; CSP on the shell; sanitize email HTML (`DOMPurify`) before render; block remote code in webviews.
- **Performance:** virtualize long lists; incremental sync; background workers; FTS5 for search; lazy-load bodies.
- **Reliability:** idempotent sync (UIDVALIDITY + UID), transactional DB writes, retry/backoff for network, structured logging to `resources/logs`.
- **Data location:** `%LOCALAPPDATA%\CloverMail\` (DB, attachments blob store, caches, logs), mirroring Mailbird's layout for familiarity.
- **Testing:** unit (vitest) for parsers/ICS/recurrence; integration for sync against a local Dovecot/GreenMail; Playwright for UI smoke via Electron.
- **Licensing/IP:** do not copy Mailbird assets or code; this is an independent implementation. Wallpaper Engine content is user-supplied; respect its license.

---

## 8. Open questions

1. Wallpaper Engine: confirm the local Web API availability/port/version on your machine before Phase 3.
2. opencode integration: server mode vs SDK vs terminal — decide at Phase 5 based on the installed version.
3. Calendar sync-back (CalDAV / Google Calendar write) — v2?
4. POP3 and Exchange support — v2?
5. Account secret handling: DPAPI is per-user/per-machine; confirm acceptable for your deployment.

---

## APPENDIX: Mailbird findings (static analysis)

Target: **Mailbird 4.35.1.20126**, `%LOCALAPPDATA%\MailbirdForWindows\current`, .NET 10, x86_64.
Tooling: REA (`rea-agents@6.4.0`) managed static provider (`rea-dotnet-static`).

- **Artifacts.** `Mailbird.exe` / `Mailbird Browser.exe` / `Mailbird.PreviewHost.exe` are native apphosts; managed code lives in `*.dll`. Entry `Mailbird.dll` (Evidence `ev_527436d0…`): `Mailbird.Program`, `Mailbird.App`, `Mailbird.MainWindow`.
- **Processes.** UI (Avalonia) + CEF `Mailbird Browser` + `PreviewHost`; lifecycle methods include `CreateWithBootstrapper`, `RegisterProtocols`, `OnProtocolActivated`, `TryShutdownCefThenApplicationAsync`, `ShutdownAsync`/`RestartAsync` (Velopack updater referenced).
- **UI stack.** Avalonia 12.0.4, ReactiveUI 23.2, DynamicData; assemblies `Mailbird.UI.Views` (~36 MB), `ViewModels`, `Styles`, `Controls`.
- **Mail/protocols.** `Mail.dll` (Limilabs), MailKit/MimeKit, DnsClient; services `Synchronizers`, `APISynchronizers`, `Connections`, `OAuth2`; `Google.Apis` (Gmail/Calendar/People), `Microsoft.Exchange.WebServices`.
- **Storage.** EF Core 10 + SQLite (`Store\Store.db`, WAL); tables include `Accounts`, `Messages`, `MessageBodies`, `Folders`, `FoldersMessages`, `Attachments`, `OAuth2Credentials`, `Filters`/`FilterActions`/`FilterConditions`, `UserContact*`, `Calendar*`, `ConversationSummaries`, and FTS5 `MessageSearchIndex`.
- **Apps/integrations.** `Mailbird.Data.Entities.Apps.CustomWebApp` + `InstalledApps` GUID list in `usersettings.json`.
- **AI/MCP.** `Mailbird.Services.Mcp` + `ModelContextProtocol.*`; `McpSettings { Enabled, Port, AuthToken, WriteToolsGranted, LogRequests }`.
- **Native layer.** `Mailbird.Platform.Native` — 77 P/Invoke imports / 102 native impls against `user32`, `dwmapi`, `kernel32`, `gdi32`, `shell32`, `ntdll` (window mgmt, hotkeys, hooks, DWM, tray, clipboard, AppUserModelID).
- **Ops.** Velopack updater, Sentry, NLog, Mixpanel (`mixpanel-csharp`), LogicNP licensing; data dir `%LOCALAPPDATA%\MailbirdNext\Release` (Store, Avatars, CefCache, Logs, Sentry, Onboarding).

*Confidence: structural observations from shipped metadata (observed); feature-to-code mappings are inferences; behavior not execution-verified.*
