# Clover Mail — project rules

## Hard rules (never break these)

1. **Updates must never delete or overwrite user data.** Accounts, cached mail,
   attachments, labels, settings and the database live in the app's user-data
   folder (`app.getPath('userData')`) — `%APPDATA%\clover-mail` for a development
   build, `%APPDATA%\Clover Mail` for a packaged install. An update may replace
   program files only. Never set `deleteAppDataOnUninstall: true`, never point
   cleanup/migration/seeding code at existing data destructively, and only seed
   the database on first run (when the target file does not exist). When adding
   any code that removes files, keep it scoped to its own cache directory
   (e.g. the `*-updater` folder), never to the user data directory.

2. **Every change ships with a version bump and a push.** Bump `version` in
   `package.json` (patch, e.g. `0.4.9` -> `0.4.10`) in its own commit
   `Bump version to X.Y.Z`, then push `main`. Never leave `main` with
   unpublished commits.

## Release process

1. `npm run typecheck` and `npm run test:smoke` must pass.
2. Bump `package.json` and commit `Bump version to X.Y.Z`.
3. Build the installer: `npm run dist` (outputs to `release/`).
4. Push `main`, tag `vX.Y.Z` at the release commit, push the tag.
5. Create the GitHub release titled `Clover Mail X.Y.Z` with notes, uploading:
   - `release/CloverMail-X.Y.Z-setup.exe`
   - `release/CloverMail-X.Y.Z-setup.exe.blockmap`
   - `release/latest.yml`

The in-app updater reads GitHub Releases (via `latest.yml`), not commits — a
version is not "released" until the release and its assets exist on GitHub.

## Platforms

- **Windows** is built and released manually (steps above).
- **Linux** is built by CI: `.github/workflows/release-linux.yml` runs on
  `release: published`, builds the AppImage + deb on a Linux runner (native
  modules must be built on the target OS), and attaches
  `CloverMail-X.Y.Z-x64.AppImage`, `CloverMail-X.Y.Z-x64.deb` and
  `latest-linux.yml` to the same release. Do not build Linux artifacts on
  Windows.
- **Android** is a separate client (Electron has no Android target); see
  `PLAN-mobile.md`.
