# Clover Mail

A fast, good-looking desktop email client for Windows — with live wallpapers, custom apps, calendar/ICS, a rules engine, smart spam protection, and an AI copilot.

Built with **Electron + React + TypeScript**, local-first (SQLite), by [@khaelec](https://github.com/khaelec).

☕ **Support the project:** [buymeacoffee.com/khaelec](https://buymeacoffee.com/khaelec)

---

## Features

**Mail**
- IMAP + SMTP, multiple accounts, and a **Unified Inbox**
- **Live (IMAP IDLE) sync** — new mail arrives automatically
- Rich-text composer, attachments, picture **signatures**, and **send-as aliases**
- Threaded conversations; mark read/unread, star, **Important**, Archive, Delete
- **Rules/workflow engine** (conditions → move/mark/star/spam) applied on sync
- **Smart spam** — local heuristics + a model you train, with a Junk view and user guidance
- **FTS5 full-text search**; per-folder **Export to mbox** (offline archive)
- **Right-click** menus on messages and folders (incl. **Empty Trash/Junk**), multi-select bulk actions, drag-to-move

**Calendar**
- Month / week / agenda, multiple calendars
- **ICS import** (file, drag-drop, or straight from an email invite) + export

**Apps**
- Embed your own **web apps / PWAs** (e.g. an internal IT app) in isolated, persistent sessions
- Open an app **beside the reader** in a resizable dock

**AI copilot**
- **Claude**, **Ollama (local)**, and **opencode** — streaming chat with email context
- Built-in **MCP server** exposing mail tools to Claude and other MCP clients

**Look & feel**
- Light / Dark / System themes + accent colors
- **Live wallpapers** — video, GIF, image slideshow, HTML, and **Wallpaper Engine** auto-discovery
- Native spellcheck + local **grammar check** (Harper)

**Accounts**
- App-password IMAP/SMTP, plus **Google** and **Microsoft/Outlook OAuth**

## Getting started

```bash
npm install
npm run dev        # run the app (hot reload)
npm run typecheck  # type-check
npm run build      # production bundle
npm run dist       # build the Windows installer (electron-builder)
```

Requires **Node 20+** on Windows. `better-sqlite3` ships N-API prebuilds, so no C++ toolchain is needed.

## Data & privacy

- Everything is local. Your mail lives in SQLite under `%APPDATA%\clover-mail\`.
- Passwords and OAuth tokens are encrypted with the Windows **DPAPI** (`safeStorage`) and never leave your machine.

## License

[MIT](LICENSE) © 2026 khaelec. Third-party components and their licenses are listed in
[THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt) — regenerated with `npm run licenses`, shipped
with the installer, and viewable in-app from **Settings → Updates & About → Open source licenses**.

## Branding

The app icon (`build/icon.ico`) and the Clover mark are the author's own artwork — replace them
before redistributing a fork. "Clover Mail" is the project name; don't imply endorsement, and check
for trademark conflicts in your region before publishing a derivative.
