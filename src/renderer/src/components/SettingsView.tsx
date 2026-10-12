import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  SETTINGS_KEYS,
  THEME_ACCENTS,
  THEME_MODES,
  type ThemeAccent,
  type ThemeMode
} from '@shared/theme'
import type { AppInfo } from '@shared/ipc'
import type { AccountAlias, AccountSummary, Snippet } from '@shared/mail'
import type { AiSettings, AiStatus, McpSettings } from '@shared/ai'
import { useTheme } from '../theme/theme'
import { useUpdate } from '../state/update'
import { IconCheck, IconMonitor, IconMoon, IconSignature, IconSun } from './icons'

const MODE_META: Record<ThemeMode, { label: string; icon: (p: { className?: string }) => ReactNode }> = {
  light: { label: 'Light', icon: IconSun },
  dark: { label: 'Dark', icon: IconMoon },
  system: { label: 'System', icon: IconMonitor }
}

type TabId = 'appearance' | 'privacy' | 'mail' | 'accounts' | 'ai' | 'about'

const TABS: { id: TabId; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'mail', label: 'Mail' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'ai', label: 'AI & MCP' },
  { id: 'about', label: 'Updates & About' }
]

const ACCENT_COLORS: Record<ThemeAccent, string> = {
  clover: '#10b981',
  ocean: '#3b82f6',
  violet: '#8b5cf6',
  sunset: '#f59e0b',
  rose: '#f43f5e',
  slate: '#64748b'
}

function Card({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <section className="rounded-2xl border border-line bg-surface/70 p-5 backdrop-blur-xl">
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  hint
}: {
  label: string
  value: string | number
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  hint?: string
}): ReactNode {
  return (
    <label className="block w-full">
      <span className="mb-1 flex items-center gap-1 text-[11px] font-medium text-muted">
        {label}
        {hint && (
          <span title={hint} className="cursor-help text-muted/70">
            ⓘ
          </span>
        )}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        title={hint}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-line bg-canvas/60 px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-accent"
      />
    </label>
  )
}

export function SettingsView(): ReactNode {
  const { mode, accent, customAccent, setMode, setAccent, setCustomAccent } = useTheme()
  const [backupAttachments, setBackupAttachments] = useState(false)
  const [backupBusy, setBackupBusy] = useState(false)
  const [backupMsg, setBackupMsg] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const [importMsg, setImportMsg] = useState('')

  async function runImportMbox(): Promise<void> {
    setImportBusy(true)
    setImportMsg('')
    try {
      const result = await window.clover.mail.pickImportMbox()
      setImportMsg(
        result ? `Imported ${result.imported} messages (${result.skipped} skipped).` : 'Cancelled'
      )
    } catch (error) {
      setImportMsg((error as Error).message)
    } finally {
      setImportBusy(false)
    }
  }

  async function runExport(): Promise<void> {
    setBackupBusy(true)
    setBackupMsg('Exporting…')
    try {
      const res = await window.clover.backup.exportBackup(backupAttachments)
      setBackupMsg(
        res.saved ? `Saved (${Math.max(1, Math.round((res.bytes ?? 0) / 1024))} KB)` : res.error ?? 'Cancelled'
      )
    } catch (error) {
      setBackupMsg((error as Error).message)
    } finally {
      setBackupBusy(false)
    }
  }

  async function runImport(): Promise<void> {
    setBackupBusy(true)
    setBackupMsg('Restoring…')
    try {
      const res = await window.clover.backup.importBackup()
      if (res.relaunching) {
        setBackupMsg('Restored — restarting…')
        return
      }
      setBackupMsg(res.error ?? 'Cancelled')
    } catch (error) {
      setBackupMsg((error as Error).message)
    } finally {
      setBackupBusy(false)
    }
  }

  async function importTheme(): Promise<void> {
    try {
      const text = await window.navigator.clipboard.readText()
      const parsed = JSON.parse(text) as {
        mode?: ThemeMode
        accent?: ThemeAccent
        customAccent?: string | null
      }
      if (parsed.mode) setMode(parsed.mode)
      if (parsed.accent) setAccent(parsed.accent)
      if (parsed.customAccent !== undefined) setCustomAccent(parsed.customAccent ?? null)
    } catch {
      // ignore invalid clipboard contents
    }
  }
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [blockRemote, setBlockRemote] = useState(true)
  const [dictationEnabled, setDictationEnabled] = useState(false)
  const [ai, setAi] = useState<AiSettings | null>(null)
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [mcp, setMcp] = useState<McpSettings | null>(null)
  const [mcpRunning, setMcpRunning] = useState(false)
  const [accounts, setAccounts] = useState<AccountSummary[]>([])
  const [sigAccountId, setSigAccountId] = useState('')
  const [sigEnabled, setSigEnabled] = useState(true)
  const [sigMsg, setSigMsg] = useState<string | null>(null)
  const sigEditorRef = useRef<HTMLDivElement>(null)
  const sigFileRef = useRef<HTMLInputElement>(null)
  const [aliasAccountId, setAliasAccountId] = useState('')
  const [aliasList, setAliasList] = useState<AccountAlias[]>([])
  const [aliasEmail, setAliasEmail] = useState('')
  const [aliasName, setAliasName] = useState('')
  const [aliasDefault, setAliasDefault] = useState<string | null>(null)
  const [snippetList, setSnippetList] = useState<Snippet[]>([])
  const [snippetName, setSnippetName] = useState('')
  const [snippetBody, setSnippetBody] = useState('')
  const [googleClientId, setGoogleClientId] = useState('')
  const [googleSecret, setGoogleSecret] = useState('')
  const [googleMsg, setGoogleMsg] = useState<string | null>(null)
  const [msClientId, setMsClientId] = useState('')
  const [msSecret, setMsSecret] = useState('')
  const [msMsg, setMsMsg] = useState<string | null>(null)
  const [tab, setTab] = useState<TabId>('appearance')
  const updateStatus = useUpdate((s) => s.status)
  const updateVersion = useUpdate((s) => s.version)
  const updatePercent = useUpdate((s) => s.percent)
  const updateError = useUpdate((s) => s.error)
  const checkUpdates = useUpdate((s) => s.check)
  const downloadUpdate = useUpdate((s) => s.download)
  const installUpdate = useUpdate((s) => s.install)
  const updateText =
    updateStatus === 'checking'
      ? 'Checking…'
      : updateStatus === 'available'
        ? `v${updateVersion} available`
        : updateStatus === 'downloading'
          ? `Downloading ${updatePercent ?? 0}%`
          : updateStatus === 'ready'
            ? `Update ${updateVersion ? `v${updateVersion} ` : ''}downloaded`
            : updateStatus === 'none'
              ? 'Up to date'
              : updateStatus === 'dev'
                ? 'Updates are disabled in development builds'
                : updateStatus === 'error'
                  ? (updateError ?? 'Could not check')
                  : ''

  useEffect(() => {
    void window.clover.appInfo().then(setInfo)
    void window.clover.settings.getAll().then((settings) => {
      setBlockRemote(settings[SETTINGS_KEYS.blockRemoteImages] === true)
      setDictationEnabled(settings[SETTINGS_KEYS.dictationEnabled] === true)
    })
    void window.clover.ai.getSettings().then(setAi)
    void window.clover.ai.status().then(setAiStatus)
    void window.clover.ai.getMcpSettings().then(setMcp)
    void window.clover.mail.listAccounts().then((list) => {
      setAccounts(list)
      if (list[0]) {
        setSigAccountId((current) => current || list[0].id)
        setAliasAccountId((current) => current || list[0].id)
      }
    })
    void window.clover.mail.getGoogleConfig().then((cfg) => setGoogleClientId(cfg.clientId))
    void window.clover.mail.getMicrosoftConfig().then((cfg) => setMsClientId(cfg.clientId))
    void window.clover.mail.listSnippets().then(setSnippetList)
  }, [])

  async function addSnippetEntry(): Promise<void> {
    if (!snippetName.trim() || !snippetBody.trim()) return
    await window.clover.mail.addSnippet(snippetName.trim(), snippetBody.trim())
    setSnippetName('')
    setSnippetBody('')
    setSnippetList(await window.clover.mail.listSnippets())
  }

  async function removeSnippetEntry(id: string): Promise<void> {
    await window.clover.mail.deleteSnippet(id)
    setSnippetList(await window.clover.mail.listSnippets())
  }

  async function saveGoogleConfig(): Promise<void> {
    await window.clover.mail.setGoogleConfig(googleClientId, googleSecret || undefined)
    setGoogleMsg('Saved. You can now use “Sign in with Google”.')
  }

  async function saveMicrosoftConfig(): Promise<void> {
    await window.clover.mail.setMicrosoftConfig(msClientId, msSecret || undefined)
    setMsMsg('Saved. You can now use “Sign in with Microsoft”.')
  }

  useEffect(() => {
    if (!aliasAccountId) return
    void window.clover.mail.listAliases(aliasAccountId).then(setAliasList)
    void window.clover.mail.getDefaultFrom(aliasAccountId).then(setAliasDefault)
  }, [aliasAccountId])

  async function addAliasEntry(): Promise<void> {
    if (!aliasAccountId || !aliasEmail.trim()) return
    await window.clover.mail.addAlias(aliasAccountId, aliasEmail.trim(), aliasName.trim() || undefined)
    setAliasEmail('')
    setAliasName('')
    setAliasList(await window.clover.mail.listAliases(aliasAccountId))
  }

  async function removeAliasEntry(id: string): Promise<void> {
    const removed = aliasList.find((a) => a.id === id)
    await window.clover.mail.deleteAlias(id)
    const next = await window.clover.mail.listAliases(aliasAccountId)
    setAliasList(next)
    if (removed && aliasDefault === removed.email) {
      await window.clover.mail.setDefaultFrom(aliasAccountId, null)
      setAliasDefault(null)
    }
  }

  async function makeDefaultFrom(email: string): Promise<void> {
    if (!aliasAccountId) return
    const primary = accounts.find((a) => a.id === aliasAccountId)?.email ?? null
    const value = email === primary ? null : email
    await window.clover.mail.setDefaultFrom(aliasAccountId, value)
    setAliasDefault(value)
  }

  useEffect(() => {
    if (!sigAccountId) return
    void (async () => {
      const sig = (await window.clover.settings.get(`signature.${sigAccountId}`)) as
        | { html?: string; enabled?: boolean }
        | undefined
      setSigEnabled(sig?.enabled !== false)
      if (sigEditorRef.current) sigEditorRef.current.innerHTML = sig?.html ?? ''
    })()
  }, [sigAccountId])

  async function saveSignature(): Promise<void> {
    if (!sigAccountId) return
    await window.clover.settings.set(`signature.${sigAccountId}`, {
      html: sigEditorRef.current?.innerHTML ?? '',
      enabled: sigEnabled
    })
    setSigMsg('Signature saved.')
  }

  function onSigImage(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      sigEditorRef.current?.focus()
      document.execCommand('insertImage', false, String(reader.result))
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  function execSig(command: string, value?: string): void {
    sigEditorRef.current?.focus()
    document.execCommand(command, false, value)
  }

  function sigLink(): void {
    const url = window.prompt('Link URL:')
    if (url) execSig('createLink', url)
  }

  function toggleBlockRemote(): void {
    const next = !blockRemote
    setBlockRemote(next)
    void window.clover.settings.set(SETTINGS_KEYS.blockRemoteImages, next)
  }

  async function patchAi(patch: Partial<AiSettings>): Promise<void> {
    const next = await window.clover.ai.setSettings(patch)
    setAi(next)
  }

  async function saveKey(): Promise<void> {
    const next = await window.clover.ai.setSettings({ claudeApiKey: apiKey })
    setAi(next)
    setApiKey('')
    setAiStatus(await window.clover.ai.status())
  }

  async function patchMcp(patch: Partial<McpSettings>): Promise<void> {
    const next = await window.clover.ai.setMcpSettings(patch)
    setMcp(next)
  }

  return (
    <div className="flex h-full">
      <nav className="w-48 shrink-0 space-y-0.5 overflow-y-auto border-r border-line bg-surface/60 p-3 backdrop-blur-xl">
        <h1 className="px-2.5 pb-2 text-[15px] font-semibold tracking-tight text-ink">Settings</h1>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={
              'block w-full rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ' +
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
        <div className="mx-auto max-w-2xl space-y-4 px-8 py-8">
          {tab === 'appearance' && (
            <>
          <Card title="Theme">
            <div className="grid grid-cols-3 gap-2">
              {THEME_MODES.map((m) => {
                const meta = MODE_META[m]
                const Icon = meta.icon
                const active = mode === m
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={
                      'flex flex-col items-center gap-2 rounded-xl border p-3 text-[12px] transition-all ' +
                      (active
                        ? 'border-accent bg-accent/8 text-accent'
                        : 'border-line text-muted hover:border-accent/40 hover:text-ink')
                    }
                  >
                    <Icon className="h-5 w-5" />
                    {meta.label}
                  </button>
                )
              })}
            </div>
          </Card>

          <Card title="Accent">
            <div className="flex flex-wrap gap-3">
              {THEME_ACCENTS.map((a) => {
                const active = accent === a
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAccent(a)}
                    title={a}
                    aria-label={a}
                    className={
                      'grid h-9 w-9 place-items-center rounded-full ring-2 ring-offset-2 ring-offset-surface transition-transform hover:scale-105 ' +
                      (active ? 'ring-ink' : 'ring-transparent')
                    }
                    style={{ backgroundColor: ACCENT_COLORS[a] }}
                  >
                    {active && <IconCheck className="h-4 w-4 text-white" />}
                  </button>
                )
              })}
            </div>
          </Card>

          <Card title="Custom theme">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={customAccent ?? ACCENT_COLORS[accent]}
                onChange={(e) => setCustomAccent(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded-lg border border-line bg-canvas/60"
              />
              <span className="text-[12px] text-muted">
                Pick any accent color, or copy and import a theme between machines.
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCustomAccent(null)}
                className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-muted hover:text-ink"
              >
                Reset to preset
              </button>
              <button
                type="button"
                onClick={() =>
                  void window.navigator.clipboard.writeText(
                    JSON.stringify({ mode, accent, customAccent })
                  )
                }
                className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-muted hover:text-ink"
              >
                Copy theme
              </button>
              <button
                type="button"
                onClick={() => void importTheme()}
                className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-muted hover:text-ink"
              >
                Import theme
              </button>
            </div>
          </Card>
            </>
          )}

          {tab === 'privacy' && (
          <Card title="Privacy">
            <button
              type="button"
              onClick={toggleBlockRemote}
              className="flex w-full items-center justify-between gap-4 text-left"
            >
              <span>
                <span className="block text-[13px] text-ink">Block remote images</span>
                <span className="mt-0.5 block text-[12px] text-muted">
                  Prevents senders from tracking when you open a message. Inline images still show.
                </span>
              </span>
              <span
                className={
                  'relative h-6 w-11 shrink-0 rounded-full transition-colors ' +
                  (blockRemote ? 'bg-accent' : 'bg-line')
                }
              >
                <span
                  className={
                    'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ' +
                    (blockRemote ? 'left-[22px]' : 'left-0.5')
                  }
                />
              </span>
            </button>
          </Card>
          )}

          {tab === 'mail' && (
          <>
          <Card title="Dictation">
            <button
              type="button"
              onClick={() => {
                const next = !dictationEnabled
                setDictationEnabled(next)
                void window.clover.settings.set(SETTINGS_KEYS.dictationEnabled, next)
              }}
              className="flex w-full items-center justify-between gap-4 text-left"
            >
              <span>
                <span className="block text-[13px] text-ink">Dictate replies by voice</span>
                <span className="mt-0.5 block text-[12px] text-muted">
                  Adds a Dictate button to the compose window that turns speech into text using the
                  Windows offline speech engine. Audio never leaves your computer. Off by default.
                </span>
              </span>
              <span
                className={
                  'relative h-6 w-11 shrink-0 rounded-full transition-colors ' +
                  (dictationEnabled ? 'bg-accent' : 'bg-line')
                }
              >
                <span
                  className={
                    'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ' +
                    (dictationEnabled ? 'left-[22px]' : 'left-0.5')
                  }
                />
              </span>
            </button>
          </Card>

          <Card title="Import mail">
            <p className="text-[12px] text-muted">
              Import messages from an .mbox file (Thunderbird, Apple Mail, Gmail Takeout, …) into a
              local &ldquo;Imported Mail&rdquo; account. Original .pst files aren&apos;t supported.
            </p>
            <button
              type="button"
              disabled={importBusy}
              onClick={() => void runImportMbox()}
              className="mt-3 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink disabled:opacity-50"
            >
              {importBusy ? 'Importing…' : 'Import .mbox file'}
            </button>
            {importMsg && <p className="mt-2 text-[12px] text-muted">{importMsg}</p>}
          </Card>

          <Card title="Signature">
            <div className="space-y-3">
              {accounts.length === 0 ? (
                <p className="text-[12px] text-muted">Add a mail account first to set a signature.</p>
              ) : (
                <>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-medium text-muted">Account</span>
                    <select
                      value={sigAccountId}
                      onChange={(e) => setSigAccountId(e.target.value)}
                      className="w-full rounded-lg border border-line bg-canvas/60 px-3 py-2 text-[13px] text-ink outline-none focus:border-accent"
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.email}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => sigFileRef.current?.click()}
                      className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12px] text-muted hover:text-ink"
                    >
                      <IconSignature className="h-3.5 w-3.5" />
                      Insert picture
                    </button>
                    <input ref={sigFileRef} type="file" accept="image/*" hidden onChange={onSigImage} />
                    <label className="ml-auto flex items-center gap-1.5 text-[12px] text-muted">
                      <input
                        type="checkbox"
                        checked={sigEnabled}
                        onChange={(e) => setSigEnabled(e.target.checked)}
                      />
                      Add to new mail
                    </label>
                  </div>
                  <div className="flex items-center gap-0.5 rounded-t-lg border border-b-0 border-line bg-canvas/40 px-1 py-1">
                    {[
                      { label: 'B', cmd: 'bold', cls: 'font-bold' },
                      { label: 'I', cmd: 'italic', cls: 'italic' },
                      { label: 'U', cmd: 'underline', cls: 'underline' },
                      { label: '•', cmd: 'insertUnorderedList', cls: '' },
                      { label: '1.', cmd: 'insertOrderedList', cls: '' },
                      { label: '⌫', cmd: 'removeFormat', cls: '' }
                    ].map((b) => (
                      <button
                        key={b.cmd}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => execSig(b.cmd)}
                        className={
                          'grid h-6 min-w-6 place-items-center rounded px-1 text-[12px] text-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/10 ' +
                          b.cls
                        }
                      >
                        {b.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={sigLink}
                      className="grid h-6 min-w-6 place-items-center rounded px-1 text-[12px] text-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/10"
                    >
                      🔗
                    </button>
                  </div>
                  <div
                    ref={sigEditorRef}
                    contentEditable
                    suppressContentEditableWarning
                    className="min-h-[110px] rounded-b-lg border border-line bg-canvas/50 px-3 py-2 text-[13px] text-ink outline-none focus:border-accent"
                  />
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void saveSignature()}
                      className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink"
                    >
                      Save signature
                    </button>
                    {sigMsg && <span className="text-[12px] text-accent">{sigMsg}</span>}
                  </div>
                  <p className="text-[11px] text-muted">
                    Pictures are embedded into outgoing messages automatically.
                  </p>
                </>
              )}
            </div>
          </Card>

          <Card title="Send-as aliases">
            <div className="space-y-3">
              {accounts.length === 0 ? (
                <p className="text-[12px] text-muted">Add a mail account first.</p>
              ) : (
                <>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-medium text-muted">Account</span>
                    <select
                      value={aliasAccountId}
                      onChange={(e) => setAliasAccountId(e.target.value)}
                      className="w-full rounded-lg border border-line bg-canvas/60 px-3 py-2 text-[13px] text-ink outline-none focus:border-accent"
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.email}
                        </option>
                      ))}
                    </select>
                  </label>

                  {(() => {
                    const primaryEmail = accounts.find((a) => a.id === aliasAccountId)?.email ?? ''
                    const rows = [
                      { id: '__primary__', name: null as string | null, email: primaryEmail },
                      ...aliasList.map((a) => ({ id: a.id, name: a.name, email: a.email }))
                    ].filter((row) => row.email)
                    return (
                      <ul className="space-y-1.5">
                        {rows.map((row) => {
                          const isDefault = (aliasDefault ?? primaryEmail) === row.email
                          return (
                            <li
                              key={row.id}
                              className="flex items-center gap-2 rounded-lg border border-line bg-canvas/40 px-3 py-1.5 text-[13px] text-ink"
                            >
                              <span className="min-w-0 flex-1 truncate">
                                {row.name ? `${row.name} ` : ''}
                                <span className="text-muted">&lt;{row.email}&gt;</span>
                              </span>
                              {isDefault ? (
                                <span className="shrink-0 text-[11px] font-medium text-accent">Default</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => void makeDefaultFrom(row.email)}
                                  className="shrink-0 text-[11px] text-muted hover:text-accent"
                                >
                                  Make default
                                </button>
                              )}
                              {row.id !== '__primary__' && (
                                <button
                                  type="button"
                                  onClick={() => void removeAliasEntry(row.id)}
                                  className="shrink-0 text-muted hover:text-rose-500"
                                >
                                  Remove
                                </button>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )
                  })()}

                  <div className="flex flex-wrap items-end gap-2">
                    <Field label="Alias email" value={aliasEmail} onChange={setAliasEmail} placeholder="sales@yourdomain.com" hint="An address you can send from on this account. Your provider must allow sending as it (e.g. a Gmail ‘Send mail as’ alias)." />
                    <Field label="Name (optional)" value={aliasName} onChange={setAliasName} placeholder="Sales" hint="Display name shown on the From line for this alias." />
                    <button
                      type="button"
                      onClick={() => void addAliasEntry()}
                      className="mb-0.5 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-accent-ink"
                    >
                      Add
                    </button>
                  </div>
                  <p className="text-[11px] text-muted">
                    Aliases appear in the composer&apos;s “From” menu. Mark one as Default to send as it
                    automatically. Make sure your provider allows sending as them.
                  </p>
                </>
              )}
            </div>
          </Card>

          <Card title="Snippets">
            <div className="space-y-3">
              {snippetList.length > 0 && (
                <ul className="space-y-1.5">
                  {snippetList.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center gap-2 rounded-lg border border-line bg-canvas/40 px-3 py-1.5 text-[13px] text-ink"
                    >
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      <button
                        type="button"
                        onClick={() => void removeSnippetEntry(s.id)}
                        className="text-muted hover:text-rose-500"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Field label="Name" value={snippetName} onChange={setSnippetName} placeholder="e.g. Meeting follow-up" />
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-muted">Text / HTML</span>
                <textarea
                  value={snippetBody}
                  onChange={(e) => setSnippetBody(e.target.value)}
                  className="min-h-[80px] w-full rounded-lg border border-line bg-canvas/60 px-3 py-2 text-[13px] text-ink outline-none focus:border-accent"
                />
              </label>
              <button
                type="button"
                onClick={() => void addSnippetEntry()}
                className="rounded-lg bg-accent px-3.5 py-2 text-[12px] font-semibold text-accent-ink"
              >
                Add snippet
              </button>
              <p className="text-[11px] text-muted">Insert snippets from the composer&apos;s Snippet menu.</p>
            </div>
          </Card>
            </>
          )}

          {tab === 'accounts' && (
          <Card title="OAuth clients (optional)">
            <div className="space-y-4">
              <div className="rounded-xl border border-line p-3">
                <div className="mb-1 text-[12px] font-medium text-ink">Google</div>
                <p className="mb-2 text-[11px] text-muted">
                  Desktop-app OAuth client from Google Cloud Console. Redirect: loopback. Secret optional (PKCE).
                </p>
                <Field label="Client ID" value={googleClientId} onChange={setGoogleClientId} placeholder="xxxxx.apps.googleusercontent.com" hint="Google Cloud Console → Credentials → OAuth client ID (type: Desktop app). Enables “Sign in with Google” instead of an app password." />
                <div className="mt-2">
                  <Field label="Client Secret (optional)" type="password" value={googleSecret} onChange={setGoogleSecret} hint="Only required for ‘Web application’ OAuth clients. Desktop clients use PKCE, so leave this blank." />
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <button type="button" onClick={() => void saveGoogleConfig()} className="rounded-lg bg-accent px-3.5 py-2 text-[12px] font-semibold text-accent-ink">
                    Save Google
                  </button>
                  {googleMsg && <span className="text-[11px] text-accent">{googleMsg}</span>}
                </div>
              </div>

              <div className="rounded-xl border border-line p-3">
                <div className="mb-1 text-[12px] font-medium text-ink">Microsoft / Outlook</div>
                <p className="mb-2 text-[11px] text-muted">
                  Register an app in Azure (Entra) → “Mobile and desktop applications”, redirect <code>http://localhost</code>.
                  Public client (no secret needed).
                </p>
                <Field label="Application (client) ID" value={msClientId} onChange={setMsClientId} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" hint="Azure/Entra → App registrations → Application (client) ID. Add a ‘Mobile and desktop applications’ redirect of http://localhost." />
                <div className="mt-2">
                  <Field label="Client Secret (optional)" type="password" value={msSecret} onChange={setMsSecret} hint="Only needed if you made it a confidential client. Public clients don’t require a secret." />
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <button type="button" onClick={() => void saveMicrosoftConfig()} className="rounded-lg bg-accent px-3.5 py-2 text-[12px] font-semibold text-accent-ink">
                    Save Microsoft
                  </button>
                  {msMsg && <span className="text-[11px] text-accent">{msMsg}</span>}
                </div>
              </div>
            </div>
          </Card>
          )}

          {tab === 'ai' && (
          <>
          <Card title="AI copilot">
            <div className="space-y-4">
              <div className="rounded-xl border border-line p-3">
                <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-ink">
                  Claude
                  <span className={'h-1.5 w-1.5 rounded-full ' + (aiStatus?.claudeConfigured ? 'bg-emerald-500' : 'bg-muted/50')} />
                </div>
                <Field
                  label="Anthropic API key"
                  type="password"
                  value={apiKey}
                  onChange={setApiKey}
                  placeholder={aiStatus?.claudeConfigured ? '•••••• (saved)' : 'sk-ant-…'}
                />
                <div className="mt-2 flex items-end gap-2">
                  <button type="button" onClick={saveKey} className="rounded-lg bg-accent px-3 py-2 text-[12px] font-medium text-accent-ink">
                    Save key
                  </button>
                  <Field label="Claude model" value={ai?.claudeModel ?? ''} onChange={(v) => void patchAi({ claudeModel: v })} hint="Anthropic model id, e.g. claude-sonnet-4-5. Choose one in the Copilot’s model dropdown." />
                </div>
              </div>

              <div className="rounded-xl border border-line p-3">
                <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-ink">
                  Ollama (local)
                  <span className={'h-1.5 w-1.5 rounded-full ' + (aiStatus?.ollamaReachable ? 'bg-emerald-500' : 'bg-muted/50')} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Base URL" value={ai?.ollamaBaseUrl ?? ''} onChange={(v) => void patchAi({ ollamaBaseUrl: v })} hint="Where Ollama listens locally. Default http://127.0.0.1:11434." />
                  <Field label="Model" value={ai?.ollamaModel ?? ''} onChange={(v) => void patchAi({ ollamaModel: v })} hint="An installed Ollama model, e.g. llama3.1 or qwen2.5. Models are auto-detected in the Copilot." />
                </div>
                {aiStatus && aiStatus.ollamaModels.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {aiStatus.ollamaModels.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => void patchAi({ ollamaModel: m })}
                        className={
                          'rounded-md border px-2 py-0.5 text-[11px] ' +
                          (ai?.ollamaModel === m ? 'border-accent text-accent' : 'border-line text-muted hover:text-ink')
                        }
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-line p-3">
                <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-ink">
                  opencode
                  <span className={'h-1.5 w-1.5 rounded-full ' + (aiStatus?.opencodeAvailable ? 'bg-emerald-500' : 'bg-muted/50')} />
                </div>
                <Field
                  label="Workspace folder"
                  value={ai?.opencodeWorkspace ?? ''}
                  onChange={(v) => void patchAi({ opencodeWorkspace: v })}
                  placeholder="C:\\path\\to\\project"
                  hint="Folder where the opencode CLI runs when you use the opencode provider."
                />
                <Field
                  label="Model"
                  value={ai?.opencodeModel ?? 'default'}
                  onChange={(v) => void patchAi({ opencodeModel: v })}
                  placeholder="default"
                  hint="provider/model, e.g. opencode/gpt-5. Leave as 'default' to use your opencode config. All models are listed in the Copilot."
                />
                <Field
                  label="opencode executable (optional)"
                  value={ai?.opencodePath ?? ''}
                  onChange={(v) => void patchAi({ opencodePath: v })}
                  placeholder="C:\\Users\\you\\AppData\\Roaming\\npm\\node_modules\\opencode-ai\\bin\\opencode.exe"
                  hint="Only needed if Clover Mail can't find the opencode CLI automatically."
                />
                {aiStatus && aiStatus.opencodeModels.length > 0 && (
                  <div className="mt-2 max-h-40 space-y-2 overflow-y-auto rounded-lg border border-line p-2">
                    {(() => {
                      const groups = new Map<string, { full: string; label: string }[]>()
                      for (const entry of aiStatus.opencodeModels) {
                        const slash = entry.indexOf('/')
                        const provider = slash >= 0 ? entry.slice(0, slash) : 'models'
                        const label = slash >= 0 ? entry.slice(slash + 1) : entry
                        const list = groups.get(provider) ?? []
                        list.push({ full: entry, label })
                        groups.set(provider, list)
                      }
                      return [...groups.entries()].map(([provider, items]) => (
                        <div key={provider}>
                          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                            {provider}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {items.map((it) => (
                              <button
                                key={it.full}
                                type="button"
                                title={it.full}
                                onClick={() => void patchAi({ opencodeModel: it.full })}
                                className={
                                  'rounded-full border px-2 py-0.5 text-[11px] ' +
                                  (ai?.opencodeModel === it.full
                                    ? 'border-accent text-accent'
                                    : 'border-line text-muted hover:text-ink')
                                }
                              >
                                {it.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))
                    })()}
                  </div>
                )}
                <p className="mt-1 text-[11px] text-muted">
                  Runs the opencode CLI in this folder when you use the opencode provider.
                </p>
              </div>
            </div>
          </Card>

          <Card title="Model Context Protocol (MCP)">
            <div className="space-y-3">
              <button type="button" onClick={() => void patchMcp({ enabled: !mcp?.enabled })} className="flex w-full items-center justify-between gap-4 text-left">
                <span>
                  <span className="block text-[13px] text-ink">Enable Clover Mail MCP server</span>
                  <span className="mt-0.5 block text-[12px] text-muted">Expose read tools (list/search/read) to Claude and other MCP clients.</span>
                </span>
                <span className={'relative h-6 w-11 shrink-0 rounded-full transition-colors ' + (mcp?.enabled ? 'bg-accent' : 'bg-line')}>
                  <span className={'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ' + (mcp?.enabled ? 'left-[22px]' : 'left-0.5')} />
                </span>
              </button>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Port" type="number" value={mcp?.port ?? 8765} onChange={(v) => void patchMcp({ port: Number(v) || 0 })} hint="Local TCP port the MCP server listens on (127.0.0.1)." />
                <Field label="Auth token" value={mcp?.token ?? ''} onChange={(v) => void patchMcp({ token: v })} placeholder="optional" hint="Shared secret MCP clients must send. Recommended if anything else runs locally." />
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => void window.clover.ai.mcpStart().then((r) => setMcpRunning(r.running))} className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-accent-ink">
                  Start
                </button>
                <button type="button" onClick={() => void window.clover.ai.mcpStop().then(() => setMcpRunning(false))} className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-muted hover:text-ink">
                  Stop
                </button>
                <span className={'text-[12px] ' + (mcpRunning ? 'text-emerald-500' : 'text-muted')}>
                  {mcpRunning ? `Running on 127.0.0.1:${mcp?.port}` : 'Stopped'}
                </span>
              </div>
              <p className="text-[11px] text-muted">Endpoint: <code>http://127.0.0.1:{mcp?.port ?? 8765}/mcp</code></p>
            </div>
          </Card>
            </>
          )}

          {tab === 'about' && (
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
            </dl>
            <div className="mt-4 flex flex-wrap items-center gap-3">
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
            </div>
            {updateStatus === 'ready' && (
              <p className="mt-2 text-[12px] text-muted">
                If the app doesn&apos;t restart by itself, quit Clover Mail from the tray and run the
                downloaded installer once.
              </p>
            )}
          </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
