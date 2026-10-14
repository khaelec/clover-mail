# Clover Mail — Linux & Android plan

## Ground rules (avoid interference)

- **Branches:** Windows work on `main`; Linux on `feat/linux`; Android on
  `feat/android`. Rebase before merging.
- **Version ownership:** one owner for `package.json` version, the git tag and
  the GitHub release. One release per version carries **all** platform assets.
- **File ownership:** platform agents own `electron-builder*.yml` targets and
  `build/` icons; the app owner owns `src/**` and the release flow. Anyone
  touching `src/shared/**` or `src/main/db/migrations.ts` coordinates first.
- Keep the hard rules in `AGENTS.md` (never delete user data; bump + push).

## Linux (contained — same Electron project)

Status: build config, `build/icon.png`, platform guards and CI are in place.

1. **Build config** — `electron-builder.yml` `linux` target: AppImage
   (auto-update capable) + deb, `category: Network`, `build/icon.png`.
2. **Icons** — `build/icon.png` (512×512), derived from the 256 frame in
   `build/icon.ico`.
3. **Native modules** — `better-sqlite3` is N-API; the Linux `.node` must be
   built on Linux. **Build Linux artifacts on Linux (CI), never on Windows.**
4. **Platform guards** (done): `win.setOverlayIcon` is Windows-only;
   `app.setBadgeCount` is used on macOS/Linux. `dictation.ts` and
   `ai/opencode.ts` already guard `win32`.
5. **Secrets** — `safeStorage` uses libsecret (GNOME Keyring / KWallet). When
   unavailable, `secrets.ts` already falls back to a clearly-marked plaintext
   value.
6. **Updater** — AppImage auto-updates via `latest-linux.yml`; deb does not.
7. **CI** — `.github/workflows/release-linux.yml` builds on `release: published`
   and attaches the AppImage, deb and `latest-linux.yml` to the release.

Risks: Wayland/GNOME tray + notification differences; libsecret availability.

## Android (separate client — Electron has no Android target)

The mail engine (imapflow, nodemailer, better-sqlite3, filesystem) runs in the
Electron **main** process, which a mobile webview / React Native JS runtime
cannot host. Android is therefore a new client, not a build target.

### Options

- **A. Capacitor + shared UI (recommended).** Reuse the React renderer; move the
  engine behind a transport interface; the phone talks to the engine over
  HTTP/WebSocket.
- **B. React Native / Tauri Mobile.** Reimplement UI + engine — largest effort.
- **C. PWA / mobile web served by the desktop app** (self-hosted webmail) —
  cheapest, but the desktop must be running and reachable.
- **D. Thin client to a hosted server** — best UX, adds a server to run.

### Recommended architecture (A/C/D)

Extract a **platform-agnostic core** from `src/main` (accounts, IMAP/SMTP,
storage, search) behind a `MailTransport` interface:

- Desktop: current in-process Electron main adapter.
- Mobile: the same core running in a small Node service (on the desktop or a
  server), consumed by the mobile UI over HTTP/WS.

### Phases

1. **Extract the core** into `src/core` with no Electron imports; `src/main`
   becomes the desktop adapter. No behavior change on Windows. (Shared
   prerequisite; also improves Linux cleanliness.)
2. **Transport server:** expose the core over local HTTP/WS with token auth
   (LAN, option C) and/or deployable (option D).
3. **Mobile shell (Capacitor):** wrap the renderer; replace `window.clover` with
   an HTTP/WS client implementing the same `CloverApi`; Android Keystore for
   secrets; system notifications.
4. **Mobile UX pass:** responsive layout, touch targets, background sync via
   periodic + FCM push (IMAP IDLE is unreliable on mobile).
5. **Ship:** signed APK/AAB; Play Store later.

### Desktop-only features to gate on mobile

Embedded app dock/webviews (Messenger/WhatsApp), Wallpaper Engine, dictation,
system tray.

### Effort

Linux: ~1–2 days. Android: a multi-week project.

## Sequencing

1. Linux (fast win) → release with Windows + Linux assets.
2. Core extraction (no user-visible change) — enables Android.
3. Transport server + Capacitor shell → Android MVP.
4. Mobile polish → Play Store.
