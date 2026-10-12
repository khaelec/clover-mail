import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  SETTINGS_KEYS,
  THEME_ACCENTS,
  THEME_MODES,
  type ThemeAccent,
  type ThemeMode
} from '@shared/theme'
import type { AppInfo } from '@shared/ipc'
import type { AccountAlias, AccountSummary } from '@shared/mail'
import type { AiSettings, AiStatus, McpSettings } from '@shared/ai'
import { useTheme } from '../theme/theme'
import { IconCheck, IconMonitor, IconMoon, IconSignature, IconSun } from './icons'

const MODE_META: Record<ThemeMode, { label: string; icon: (p: { className?: string }) => ReactNode }> = {
  light: { label: 'Light', icon: IconSun },
  dark: { label: 'Dark', icon: IconMoon },
  system: { label: 'System', icon: IconMonitor }
}

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
  placeholder
}: {
  label: string
  value: string | number
  onChange: (value: string) => void
  type?: string
  placeholder?: string
}): ReactNode {
  return (
    <label className="block w-full">
      <span className="mb-1 block text-[11px] font-medium text-muted">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-line bg-canvas/60 px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-accent"
      />
    </label>
  )
}

export function SettingsView(): ReactNode {
  const { mode, accent, setMode, setAccent } = useTheme()
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [blockRemote, setBlockRemote] = useState(true)
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
  const [googleClientId, setGoogleClientId] = useState('')
  const [googleSecret, setGoogleSecret] = useState('')
  const [googleMsg, setGoogleMsg] = useState<string | null>(null)

  useEffect(() => {
    void window.clover.appInfo().then(setInfo)
    void window.clover.settings.getAll().then((settings) => {
      setBlockRemote(settings[SETTINGS_KEYS.blockRemoteImages] === true)
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
  }, [])

  async function saveGoogleConfig(): Promise<void> {
    await window.clover.mail.setGoogleConfig(googleClientId, googleSecret || undefined)
    setGoogleMsg('Saved. You can now use “Sign in with Google”.')
  }

  useEffect(() => {
    if (!aliasAccountId) return
    void window.clover.mail.listAliases(aliasAccountId).then(setAliasList)
  }, [aliasAccountId])

  async function addAliasEntry(): Promise<void> {
    if (!aliasAccountId || !aliasEmail.trim()) return
    await window.clover.mail.addAlias(aliasAccountId, aliasEmail.trim(), aliasName.trim() || undefined)
    setAliasEmail('')
    setAliasName('')
    setAliasList(await window.clover.mail.listAliases(aliasAccountId))
  }

  async function removeAliasEntry(id: string): Promise<void> {
    await window.clover.mail.deleteAlias(id)
    setAliasList(await window.clover.mail.listAliases(aliasAccountId))
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
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-8 py-8">
        <h1 className="text-xl font-semibold tracking-tight text-ink">Settings</h1>
        <p className="mt-1 text-[13px] text-muted">Appearance and application information.</p>

        <div className="mt-6 space-y-4">
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

                  {aliasList.length > 0 && (
                    <ul className="space-y-1.5">
                      {aliasList.map((a) => (
                        <li
                          key={a.id}
                          className="flex items-center gap-2 rounded-lg border border-line bg-canvas/40 px-3 py-1.5 text-[13px] text-ink"
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {a.name ? `${a.name} ` : ''}
                            <span className="text-muted">&lt;{a.email}&gt;</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => void removeAliasEntry(a.id)}
                            className="text-muted hover:text-rose-500"
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="flex flex-wrap items-end gap-2">
                    <Field label="Alias email" value={aliasEmail} onChange={setAliasEmail} placeholder="sales@yourdomain.com" />
                    <Field label="Name (optional)" value={aliasName} onChange={setAliasName} placeholder="Sales" />
                    <button
                      type="button"
                      onClick={() => void addAliasEntry()}
                      className="mb-0.5 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-accent-ink"
                    >
                      Add
                    </button>
                  </div>
                  <p className="text-[11px] text-muted">
                    Aliases appear in the composer&apos;s “From” menu. Make sure your provider allows sending as them.
                  </p>
                </>
              )}
            </div>
          </Card>

          <Card title="Google OAuth (optional)">
            <div className="space-y-3">
              <p className="text-[12px] text-muted">
                To sign in to Gmail without an app password, create a <strong>Desktop app</strong> OAuth client in
                Google Cloud Console and paste its Client ID here (redirect: loopback). The secret is optional for PKCE.
              </p>
              <Field label="Google Client ID" value={googleClientId} onChange={setGoogleClientId} placeholder="xxxxx.apps.googleusercontent.com" />
              <Field label="Google Client Secret (optional)" type="password" value={googleSecret} onChange={setGoogleSecret} placeholder="optional" />
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => void saveGoogleConfig()} className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink">
                  Save
                </button>
                {googleMsg && <span className="text-[12px] text-accent">{googleMsg}</span>}
              </div>
            </div>
          </Card>

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
                  <Field label="Claude model" value={ai?.claudeModel ?? ''} onChange={(v) => void patchAi({ claudeModel: v })} />
                </div>
              </div>

              <div className="rounded-xl border border-line p-3">
                <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-ink">
                  Ollama (local)
                  <span className={'h-1.5 w-1.5 rounded-full ' + (aiStatus?.ollamaReachable ? 'bg-emerald-500' : 'bg-muted/50')} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Base URL" value={ai?.ollamaBaseUrl ?? ''} onChange={(v) => void patchAi({ ollamaBaseUrl: v })} />
                  <Field label="Model" value={ai?.ollamaModel ?? ''} onChange={(v) => void patchAi({ ollamaModel: v })} />
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
                />
                <p className="mt-1 text-[11px] text-muted">Runs the opencode CLI in this folder when you use the opencode provider.</p>
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
                <Field label="Port" type="number" value={mcp?.port ?? 8765} onChange={(v) => void patchMcp({ port: Number(v) || 0 })} />
                <Field label="Auth token" value={mcp?.token ?? ''} onChange={(v) => void patchMcp({ token: v })} placeholder="optional" />
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
            </dl>
          </Card>
        </div>
      </div>
    </div>
  )
}
