# Clover Mail — Android plan (standalone)

## Decision

Clover Mail for Android is a **standalone mail app**. It talks to mail servers
directly, keeps its own local database, and works with no desktop running.

The first Android client (0.4.73) was a remote control for the desktop: the
engine ran on the PC and the phone reached it over Wi-Fi. It was reverted in
0.4.74 because it was useless without a running, reachable desktop, and the
desktop server it needed was a security liability (it listened on every
network interface, used plain HTTP, and had a token that never changed). **Do
not reintroduce any phone-to-desktop dependency.**

## Approach in one paragraph

Run the **same mail engine** (`src/core`) on the phone inside an embedded
Node.js runtime (**nodejs-mobile**), hosted by a **Capacitor** app whose WebView
runs the existing React UI. The UI calls the engine through a **message
channel** using the existing `dispatch(channel, args)` registry. Every engine
fix (reconcile, de-duplication, undo, rules, spam) then applies to desktop and
Android alike. The only part that needs replacing per platform is the
**database driver**.

```
┌──────────────── Android app (Capacitor) ─────────────────┐
│                                                          │
│  WebView: React UI (src/renderer, compact layout)        │
│     │  window.clover = channel client (CloverApi)        │
│     ▼                                                    │
│  nodejs-mobile message channel   (no HTTP, no ports)     │
│     │                                                    │
│     ▼                                                    │
│  Node thread: src/core engine ──► IMAP / SMTP servers    │
│     │  dispatch(channel, args)                           │
│     ▼                                                    │
│  SQLite + FTS5 (app-private storage)                     │
│                                                          │
│  Kotlin: WorkManager new-mail check, Keystore, notifs    │
└──────────────────────────────────────────────────────────┘
```

### Why not the alternatives

| Option | Why not |
|---|---|
| Phone talks to desktop (the 0.4.73 design) | Needs the desktop on and reachable; exposed a LAN server. Reverted. |
| Rewrite the engine in Kotlin | Two engines to keep in sync forever; months of work. |
| Engine inside the WebView | WebViews can't open raw TCP connections, which IMAP needs. Rebuilding imapflow's networking on a socket plugin is fragile. |
| React Native / Flutter UI | Throws away the React UI and the compact layout already built. |
| Hosted server (thin client) | Adds a server to run, pay for and secure, and puts users' mail through it. |

## What we already have

- **`src/core`**: the engine, with **no Electron imports** (verified). It uses
  `node:crypto`, `fs`, `path`, `net`, `tls`, `os` and `http`, all available in
  Node. Desktop-only services go through the `Platform` interface
  (`src/core/platform.ts`).
- **`src/core/transport/registry.ts`**: `dispatch(channel, args)`, the entry
  point the phone UI will call.
- **`better-sqlite3` is confined to two files**: `src/core/db/index.ts` and
  `src/core/mail/search.ts` (raw FTS5). That's the surface the driver swap has
  to cover.
- **From the reverted companion** (tag `archive/android-companion`, branch tip
  `61068ec`), cherry-pick what still applies:
  - `c0e87a6`: compact phone layout (drawer sidebar and folder pane, list/reader
    swap)
  - `61068ec`: launcher icon and splash screens
  - `5e7e92f`: local notifications and Keystore storage (drop the token parts)
  - `a925112`, `ca3515e`: Android CI fixes (JDK 21, preinstalled SDK)
  - **Do not bring back:** the connect screen, desktop URL/token handling, the
    resume-time "ask the desktop to sync", `src/core/transport/server.ts`.

## Phases

Each phase ends with a checkpoint. Don't start the next phase until the
current one's exit criteria are met and reported.

### Phase 0: feasibility spike (2–3 days, go/no-go)

A throwaway Capacitor app on a branch, run on a **real phone** (not just the
emulator). Answer these questions and report the numbers:

1. **Node runtime:** does nodejs-mobile start inside the Capacitor app? Which
   Node version does it ship? Can it load the engine bundle?
2. **IMAP/SMTP:** can imapflow log in to Gmail with an app password, list
   folders, fetch 50 messages, and keep IDLE running? Can nodemailer send one?
3. **SQLite with FTS5:** which of these works on the phone, in this order of
   preference?
   1. `node:sqlite`, if the shipped Node version includes it (check FTS5 is
      compiled in)
   2. `better-sqlite3` cross-compiled for Android with nodejs-mobile's
      native-module tooling
   3. a WASM SQLite build **that includes FTS5**, persisted to a file
4. **Cost:** APK size increase (expect +30–50 MB), cold start to first list
   render, memory with one account synced.

**Go** if 1–3 all work and cold start is under ~3 s on a mid-range phone.
**No-go** if SQLite with FTS5 can't be made to work. Then stop and reconsider
(for example, dropping FTS5 on Android for `LIKE` search, or a different
storage layer) before building anything else.

### Phase 1: swappable database driver (desktop behaviour unchanged)

- Put `src/core/db/index.ts` behind a small driver interface: open, exec,
  prepare/run/all/get, transaction, close. Drizzle runs on top of whichever
  driver is chosen.
- Move the raw FTS5 calls in `src/core/mail/search.ts` onto the same interface.
- Desktop keeps `better-sqlite3`. Android uses the Phase 0 winner.
- **Exit:** `npm run typecheck` and `npm run test:smoke` pass on desktop with no
  behaviour change. The DB and reconcile smoke tests also pass against the
  Android driver (run under Node in CI if the driver allows it).

### Phase 2: engine inside the app

- Bundle `src/core` for nodejs-mobile and start it at app launch.
- Implement `window.clover` on Android as a **channel client**: each `CloverApi`
  call becomes `{ channel, args }` over the nodejs-mobile message channel, and
  the reply comes back with an id. Engine events (`mail:*`, `sync:*`,
  `app:notify`) are pushed over the same channel.
- Implement `Platform` for Android: file pickers and share sheets via Capacitor
  plugins, opening links in Custom Tabs, encrypting secrets with the Keystore.
- The database lives in app-private storage (`filesDir`). The phone keeps its
  **own** database. Each device syncs with the mail server directly, like any
  mail app. Nothing is shared with the desktop.
- **Exit:** add an account with an app password, sync, read, search, send,
  archive → Undo, all on a real phone with no desktop running.

### Phase 3: accounts

- **App-password IMAP/SMTP** works from Phase 2 onwards.
- **Google / Microsoft sign-in:** the desktop's loopback redirect does not
  work on phones. Use Custom Tabs + PKCE with a redirect back to the app (an
  app-link or custom scheme). Users bring their own client ID (as on desktop),
  but phones need an **Android/iOS-type** client registered in Google Cloud or
  Azure. Document the steps in Settings → Accounts, like the desktop's.
- All secrets (passwords, refresh tokens) are stored encrypted with the
  Android Keystore, never in plain files or WebView storage.

### Phase 4: background mail

Android will not keep a Node runtime alive in the background. So:

- **App open:** the full engine runs, with IDLE.
- **App in background:** a **WorkManager** periodic job (15 minutes is Android's
  minimum) runs a **small native Kotlin check**: log in, `STATUS INBOX`,
  compare `UIDNEXT` with the last known value, and post a notification for new
  mail (sender and subject via a minimal `FETCH ENVELOPE`). It does **not**
  write to the engine's database. The full sync runs when the app opens.
- **Optional "Stay connected" setting:** a foreground service keeps IDLE
  running for instant mail, at a battery cost and with a permanent
  notification, as Android requires.
- Say honestly in the UI that instant push without a server isn't possible for
  Gmail. Don't promise it.
- Notifications reuse the bell's rules: no notification for read, spam or muted
  mail, or for mail restored by Undo. Tapping one opens the conversation.

### Phase 5: mobile UX

- Apply the compact layout (from `c0e87a6`), with touch-sized targets, swipe to
  archive/delete (with the Undo toast), pull to refresh.
- **Hide desktop-only features:** embedded apps and the app dock (WhatsApp,
  Messenger webviews), live wallpapers and Wallpaper Engine, dictation, the
  tray, the MCP server, the opencode/Ollama AI providers. Claude via the API can
  stay if the user adds a key.
- The calendar is in `src/main/calendar` today. Move it into `src/core` if it's
  wanted on Android. It's not needed for the first release.

### Phase 6: ship

- CI builds a **signed release APK** on a Linux runner on `release: published`
  and attaches `CloverMail-X.Y.Z-android.apk` to the same GitHub release as
  the desktop builds. Signing keys live in repository secrets, never in the
  repo.
- `versionName` = the desktop version. `versionCode` increases with every
  release.
- An in-app update check (the same GitHub `latest` lookup the desktop uses)
  shows "Update available", opening the release page. Play Store later; it
  would make updates automatic.

## Data safety (AGENTS.md rule 1, applied to Android)

- Android keeps app data across updates. **Never** add code that clears
  `filesDir`, the database or the Keystore entries on upgrade, and never
  change the `applicationId` after the first release. A new ID is a new app
  with empty data.
- Database migrations are the same `src/core/db/migrations.ts` the desktop
  uses: additive, applied in order, and the database is only ever created when
  missing.
- Cleanup code (attachments, logs) stays scoped to its own folder inside
  app-private storage, exactly as on desktop.
- Exclude the database and secrets from Android Auto Backup unless they're
  encrypted. Restoring someone's mail database onto another device is a
  privacy risk.

## Security

- **No network listeners.** The UI talks to the engine only through the
  nodejs-mobile channel. Nothing listens on localhost or the LAN.
- The WebView loads only bundled files. Keep the desktop's strict CSP, adapted
  for the Capacitor origin.
- Email HTML keeps the desktop's protections: DOMPurify, a sandboxed iframe,
  and the CSP that blocks remote content until the user allows it.
- `android:usesCleartextTraffic="false"`. IMAP/SMTP go over TLS or STARTTLS,
  as on desktop.

## Testing

- **CI (every push):** typecheck, plus the core smoke tests run against both DB
  drivers where possible. The Dovecot integration job already covers the
  engine against a real IMAP server; its tests apply unchanged.
- **Android CI:** build the APK, plus an instrumented smoke test on an emulator
  (start the engine, add a Dovecot account through the channel, sync, check
  the list renders).
- **Manual, real phone, each release:** Gmail account with an app password;
  receive while the app is in the background (WorkManager notification); open
  from the notification; archive → Undo; search; send with an attachment;
  survive an app update with data intact.

## Risks

| Risk | Mitigation |
|---|---|
| No SQLite with FTS5 under nodejs-mobile | Phase 0 decides before any other work. Fallback: `LIKE` search on Android only. |
| nodejs-mobile ships an old Node version | Check in Phase 0. The engine targets what that version supports; only polyfill if small. |
| APK size / startup time | Measured in Phase 0. Bundle and minify the engine; load the UI first and start the engine in parallel. |
| Background limits differ by phone maker | WorkManager is the supported path. Document battery-optimisation exemptions for "Stay connected". |
| Google sign-in on mobile | App passwords work from day one; OAuth is Phase 3. |

## Ground rules

- Android work happens on `feat/android`. Merge to `main` only at the end of a
  phase, with its exit criteria met, and with one version bump (AGENTS.md
  rule 2).
- One version, one GitHub release, carrying all platform assets.
- Changes to `src/core`, `src/shared` or `src/core/db/migrations.ts` must keep
  the desktop's `typecheck` and `test:smoke` passing. The desktop is the
  product people use today.

## Linux (status)

Done: AppImage and deb built in CI (`.github/workflows/release-linux.yml`),
icons, platform guards, libsecret fallback. Open: the Flatpak bundle never
updates (no repository linked). Plan: show an in-app update notice now, then
publish to Flathub under an `io.github.khaelec.*` app ID (Flatpak only;
Windows/AppImage/deb keep `com.clovermail.app`), copying data over from the
old `com.clovermail.app` install on first launch, never moving it.
