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

## Not done yet (Phase 4 in `PLAN-mobile.md`)

- System notifications on the phone and background sync (Capacitor
  LocalNotifications + a push/periodic strategy — IMAP IDLE is unreliable on
  mobile).
- Storing the token in the Android Keystore rather than `localStorage`.
- A touch/mobile UX pass (responsive layout, larger targets).
