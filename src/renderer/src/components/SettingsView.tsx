import { useEffect, useState, type ReactNode } from 'react'
import { LinkDialog } from './LinkDialog'
import { useCompact } from '../lib/compact'
import { SettingsContext } from './settings/context'
import { useSettingsState } from './settings/useSettingsState'
import { TABS, type TabId } from './settings/ui'
import { AppearanceTab } from './settings/AppearanceTab'
import { PrivacyTab } from './settings/PrivacyTab'
import { MailTab } from './settings/MailTab'
import { AccountsTab } from './settings/AccountsTab'
import { AiTab } from './settings/AiTab'
import { AboutTab } from './settings/AboutTab'

export function SettingsView(): ReactNode {
  const [tab, setTab] = useState<TabId>('appearance')
  const compact = useCompact()
  const settings = useSettingsState(tab)

  // Lets other views (e.g. an account's sync-error dot) open a specific tab.
  useEffect(() => {
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent<{ tab?: TabId }>).detail
      if (detail?.tab) setTab(detail.tab)
    }
    window.addEventListener('clover:open-settings', handler)
    return () => window.removeEventListener('clover:open-settings', handler)
  }, [])

  return (
    <SettingsContext.Provider value={settings}>
      <div className={compact ? 'flex h-full flex-col' : 'flex h-full'}>
        <nav
          className={
            compact
              ? 'flex shrink-0 gap-1 overflow-x-auto border-b border-line bg-surface/60 p-2 backdrop-blur-xl'
              : 'w-48 shrink-0 space-y-0.5 overflow-y-auto border-r border-line bg-surface/60 p-3 backdrop-blur-xl'
          }
        >
          {!compact && (
            <h1 className="px-2.5 pb-2 text-[15px] font-semibold tracking-tight text-ink">Settings</h1>
          )}
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={
                (compact
                  ? 'shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-[12.5px] '
                  : 'block w-full rounded-lg px-2.5 py-2 text-left text-[13px] ') +
                'transition-colors ' +
                (tab === t.id
                  ? 'bg-accent/12 font-medium text-accent'
                  : 'text-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/10')
              }
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className={compact ? 'space-y-4 px-4 py-4' : 'mx-auto max-w-2xl space-y-4 px-8 py-8'}>
            {tab === 'appearance' && <AppearanceTab />}
            {tab === 'privacy' && <PrivacyTab />}
            {tab === 'mail' && <MailTab />}
            {tab === 'accounts' && <AccountsTab />}
            {tab === 'ai' && <AiTab />}
            {tab === 'about' && <AboutTab />}
          </div>
        </div>
        <LinkDialog
          open={settings.sigLinkOpen}
          onCancel={() => settings.setSigLinkOpen(false)}
          onSubmit={settings.applySigLink}
        />
        {settings.licensesOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm" onClick={() => settings.setLicensesOpen(false)}>
            <div
              className="flex h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
                <span className="text-[13px] font-semibold text-ink">Third-party licenses</span>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void window.navigator.clipboard.writeText(settings.licensesText ?? '')}
                    className="rounded-lg border border-line px-2.5 py-1 text-[12px] text-muted hover:text-ink"
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={() => settings.setLicensesOpen(false)}
                    className="rounded-lg border border-line px-2.5 py-1 text-[12px] text-muted hover:text-ink"
                  >
                    Close
                  </button>
                </div>
              </header>
              <div className="min-h-0 flex-1 overflow-auto bg-canvas/40 p-4">
                {settings.licensesText ? (
                  <pre className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed text-ink/90">
                    {settings.licensesText}
                  </pre>
                ) : (
                  <p className="text-[12px] text-muted">
                    Notices file not found. Run <code>npm run licenses</code> to generate it.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </SettingsContext.Provider>
  )
}
