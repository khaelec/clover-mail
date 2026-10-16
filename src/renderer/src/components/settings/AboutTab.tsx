import { useState, type ReactNode } from 'react'
import { useSettings } from './context'
import { Card } from './ui'
import { isNative } from '../../lib/mobile'
import { checkForUpdate, installUpdate as installNativeUpdate } from '../../lib/nativeUpdate'

export function AboutTab(): ReactNode {
  const {
    backupAttachments,
    setBackupAttachments,
    backupBusy,
    runExport,
    runImport,
    backupMsg,
    openBugReport,
    copyDiagnostics,
    diagnosticsCopied,
    info,
    customApps,
    checkUpdates,
    updateStatus,
    downloadUpdate,
    updateVersion,
    installUpdate,
    updateText,
    setLicensesText,
    setLicensesOpen
  } = useSettings()

  // Android uses its own updater (the Electron one isn't available there).
  const [nativeUpdate, setNativeUpdate] = useState<{ version: string; url: string } | null>(null)
  const [nativeNote, setNativeNote] = useState<string | null>(null)
  const [nativeBusy, setNativeBusy] = useState(false)

  async function checkNative(): Promise<void> {
    setNativeBusy(true)
    setNativeNote('Checking…')
    const info = await checkForUpdate()
    setNativeUpdate(info)
    setNativeNote(info ? null : 'You are up to date.')
    setNativeBusy(false)
  }

  async function runNative(): Promise<void> {
    if (!nativeUpdate) return
    setNativeBusy(true)
    setNativeNote('Downloading…')
    try {
      await installNativeUpdate(nativeUpdate.url)
      setNativeNote('Opening the installer…')
    } catch (error) {
      setNativeNote(error instanceof Error ? error.message : 'Update failed')
      setNativeBusy(false)
    }
  }

  return (
    <>
      <Card title="Backup & restore">
        <p className="text-[12px] text-muted">
          Export your accounts, folders, rules, labels, snippets and settings to a single file.
          Restoring replaces your current data and restarts Clover Mail. Saved passwords stay on
          this machine and can&apos;t be moved between machines.
        </p>
        <label className="mt-3 flex items-center gap-2 text-[12px] text-muted">
          <input
            type="checkbox"
            checked={backupAttachments}
            onChange={(e) => setBackupAttachments(e.target.checked)}
          />
          Include cached attachment files (larger backup)
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={backupBusy}
            onClick={() => void runExport()}
            className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink disabled:opacity-50"
          >
            Export backup
          </button>
          <button
            type="button"
            disabled={backupBusy}
            onClick={() => {
              if (
                window.confirm(
                  'Restoring replaces your current accounts, mail cache and settings, then restarts Clover Mail. Continue?'
                )
              ) {
                void runImport()
              }
            }}
            className="rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-ink hover:border-accent disabled:opacity-50"
          >
            Restore from backup
          </button>
          {backupMsg && <span className="text-[12px] text-muted">{backupMsg}</span>}
        </div>
      </Card>

      <Card title="Support">
        <p className="text-[12px] text-muted">
          Clover Mail is free and open source. If it&apos;s useful to you, you can buy me a coffee.
        </p>
        <button
          type="button"
          onClick={() => window.open('https://buymeacoffee.com/khaelec')}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#FFDD00] px-4 py-2 text-[13px] font-semibold text-black hover:brightness-95"
        >
          ☕ Buy me a coffee
        </button>

        <div className="mt-4 border-t border-line pt-4">
          <p className="text-[12px] text-muted">
            Hit a bug? Open a report on GitHub — it opens the public issue page with your
            environment filled in. Review it before submitting; issues are public.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openBugReport}
              className="rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-ink hover:border-accent"
            >
              Report a bug
            </button>
            <button
              type="button"
              onClick={copyDiagnostics}
              className="rounded-lg border border-line px-4 py-2 text-[13px] text-muted hover:text-ink"
            >
              Copy diagnostics
            </button>
            {diagnosticsCopied && <span className="text-[12px] text-muted">Copied</span>}
          </div>
        </div>
      </Card>

      <Card title="About">
        <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-[13px]">
          <dt className="text-muted">Application</dt>
          <dd className="text-ink">{info?.name ?? 'Clover Mail'}</dd>
          <dt className="text-muted">Version</dt>
          <dd className="text-ink">{info?.version ?? '—'}</dd>
          <dt className="text-muted">Electron</dt>
          <dd className="text-ink">{info?.electron ?? '—'}</dd>
          <dt className="text-muted">Chromium</dt>
          <dd className="text-ink">{info?.chrome ?? '—'}</dd>
          <dt className="text-muted">Node</dt>
          <dd className="text-ink">{info?.node ?? '—'}</dd>
          <dt className="text-muted">Data folder</dt>
          <dd className="break-all text-ink">{info?.userDataPath ?? '—'}</dd>
          <dt className="text-muted">Build</dt>
          <dd className="text-ink">
            {info?.isPackaged ? 'Installed (packaged)' : 'Development build'}
          </dd>
          <dt className="text-muted">Update feed</dt>
          <dd className="text-ink">github: khaelec/clover-mail</dd>
          <dt className="text-muted">Custom apps</dt>
          <dd className="text-ink">
            {customApps.length === 0
              ? 'None'
              : `${customApps.length} — ${customApps.map((a) => a.name).join(', ')} (run in background)`}
          </dd>
          <dt className="text-muted">License</dt>
          <dd className="text-ink">MIT (open source)</dd>
        </dl>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {isNative() ? (
            <>
              <button
                type="button"
                onClick={() => void checkNative()}
                disabled={nativeBusy}
                className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-muted hover:text-ink disabled:opacity-60"
              >
                Check for updates
              </button>
              {nativeUpdate && (
                <button
                  type="button"
                  onClick={() => void runNative()}
                  disabled={nativeBusy}
                  className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-ink disabled:opacity-60"
                >
                  Update to {nativeUpdate.version}
                </button>
              )}
              {nativeNote && <span className="text-[12px] text-muted">{nativeNote}</span>}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void checkUpdates()}
                className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-muted hover:text-ink"
              >
                Check for updates
              </button>
              {updateStatus === 'available' && (
                <button
                  type="button"
                  onClick={() => void downloadUpdate()}
                  className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-ink"
                >
                  Download {updateVersion ? `v${updateVersion}` : 'update'}
                </button>
              )}
              {updateStatus === 'ready' && (
                <button
                  type="button"
                  onClick={() => installUpdate()}
                  className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-ink"
                >
                  Restart &amp; install
                </button>
              )}
              {updateText && <span className="text-[12px] text-muted">{updateText}</span>}
            </>
          )}
          <button
            type="button"
            onClick={() => {
              void window.clover.readLicenses().then((text) => {
                setLicensesText(text)
                setLicensesOpen(true)
              })
            }}
            className="text-[12px] text-muted underline hover:text-ink"
          >
            Open source licenses
          </button>
        </div>
        {info?.platform === 'linux' && (
          <p className="mt-3 rounded-lg border border-line bg-canvas/40 p-2.5 text-[11px] text-muted">
            <strong className="text-ink">Linux updates:</strong> the AppImage does{' '}
            <strong>not</strong> self-update on immutable systems (e.g. Fedora Kinoite, Silverblue).
            Use the <strong>Flatpak</strong>, or download the latest AppImage from the releases page and
            replace the old file. The <code>.deb</code> is updated with your package manager.
          </p>
        )}
        {updateStatus === 'ready' && (
          <p className="mt-2 text-[12px] text-muted">
            If the app doesn&apos;t restart by itself, quit Clover Mail from the tray and run the
            downloaded installer once.
          </p>
        )}
      </Card>
    </>
  )
}
