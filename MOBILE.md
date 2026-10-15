# Clover Mail — Android client

The Android app is a **Capacitor** shell around the existing React renderer. It
does not run the mail engine itself: the phone talks to the Clover Mail running
on your computer over your local network (the transport server, exposed under
**Settings → Privacy → Mobile access**). This is option A/C from `PLAN-mobile.md`.

## How it fits together

```
phone (Capacitor WebView)                desktop (Electron)
  dist-mobile/index.html   ── HTTP /rpc ──►  transport server (token auth)
  window.clover (webClover) ◄─ SSE /events ─  mail engine + SQLite
```

- `vite.mobile.config.ts` builds the renderer into `dist-mobile/` as a static
  site, with a **mobile CSP** (allows connecting to the desktop over http/https
  and remote images). `capacitor.config.ts` uses `dist-mobile` as its `webDir`.
- `src/renderer/src/lib/webClover.ts` builds `window.clover` over the transport
  (POST `/rpc`, SSE `/events`) using the address + token stored by the connect
  screen. `src/renderer/src/lib/mobile.ts` holds that storage.
- On first run the shell shows `ConnectScreen`; enter the **address** and
  **token** shown on the desktop (Settings → Privacy → Mobile access).
- Desktop-only features (embedded apps, live wallpapers, dictation, system tray)
  are not part of the mobile client.

## Prerequisites

- Node.js and `npm install` (adds `@capacitor/core`, `@capacitor/android`,
  `@capacitor/cli`).
- **Android Studio** (or just the Android SDK + **JDK 21** — Capacitor 8 compiles
  for Java 21) to build the APK.
- The desktop app running with Mobile access enabled, and both devices on the
  same network.

## Build

```bash
npm install
npm run mobile:build   # renderer -> dist-mobile
npm run mobile:sync    # mobile:build + `cap sync android`
npm run mobile:open    # open the project in Android Studio
```

Or build from the command line (no Android Studio):

```bash
cd android
./gradlew assembleDebug            # macOS/Linux
gradlew.bat assembleDebug          # Windows (cmd)
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

A release build needs a signing keystore (`android/keystore.properties` +
`gradlew bundleRelease` / `assembleRelease`).

> The APK cannot be built on a machine without the Android SDK; the desktop
> (`npm run dist`) and Linux CI are unaffected by this project.

### Without a local Android SDK

`.github/workflows/android.yml` builds the debug APK on GitHub's runner (which
has the SDK) and uploads it as the **CloverMail-debug-apk** artifact. Run it from
the **Actions → Android → Run workflow** button, or push to `main` /
`feat/android`, then download `app-debug.apk` from the run.

## Status

- **Phase 3 (shell)** done, and **Phase 4** partly:
  - **Phone notifications** — new bell items (mail, reminders, send failures,
    updates) also raise a system notification via
    `@capacitor/local-notifications`, respecting Do Not Disturb; tapping one
    opens the message or section it refers to. They arrive while the app is
    running.
  - **Secure token** — the access token lives in the **Android Keystore**
    (`@aparajita/capacitor-secure-storage`); a token an older build saved in
    `localStorage` is migrated on first read.
  - **Compact phone layout** — the sidebar and folder pane become drawers and
    the list/reader swap places with a back button.
- **Not done:** background sync / push (IMAP IDLE is unreliable on mobile, so
  notifications only arrive while the app is running), and a fuller touch UX
  pass (larger targets, gestures).
