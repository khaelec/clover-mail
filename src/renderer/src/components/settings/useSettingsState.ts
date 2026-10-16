import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { SETTINGS_KEYS, type ThemeAccent, type ThemeMode } from '@shared/theme'
import type { AppInfo } from '@shared/ipc'
import type { AccountAlias, AccountSummary, Snippet } from '@shared/mail'
import type { AiSettings, AiStatus, McpSettings } from '@shared/ai'
import { useTheme } from '../../theme/theme'
import { useUpdate } from '../../state/update'
import { useApps } from '../../state/apps'
import { buildIssueUrl, openReport } from '../../lib/report'
import type { TabId } from './ui'

/** Mask email addresses (j***@gmail.com) so pasted diagnostics don't leak them. */
function redactEmails(text: string): string {
  return text.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (match) => {
    const at = match.indexOf('@')
    const user = match.slice(0, at)
    const masked = user.length <= 1 ? '*' : `${user[0]}***`
    return `${masked}${match.slice(at)}`
  })
}

/**
 * All of the Settings state, effects and handlers in one place. SettingsView
 * provides it through a context; each tab consumes the pieces it needs, so the
 * tab JSX could be moved out verbatim.
 */
export function useSettingsState(tab: TabId) {
  const { mode, accent, customAccent, setMode, setAccent, setCustomAccent } = useTheme()
  const [backupAttachments, setBackupAttachments] = useState(false)
  const [backupBusy, setBackupBusy] = useState(false)
  const [backupMsg, setBackupMsg] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const [diagnosticsCopied, setDiagnosticsCopied] = useState(false)

  function diagnosticsText(): string {
    return [
      `Clover Mail: ${info?.version ?? '?'}`,
      `Build: ${info?.isPackaged ? 'installed (packaged)' : 'development'}`,
      `OS: ${info?.platform ?? ''}`,
      `Electron: ${info?.electron ?? ''}`,
      `Chromium: ${info?.chrome ?? ''}`,
      `Node: ${info?.node ?? ''}`
    ].join('\n')
  }

  function openBugReport(): void {
    void (async () => {
      // Includes the recent log (redacted) so it lands on GitHub ready to read.
      openReport(await buildIssueUrl())
    })()
  }

  function copyDiagnostics(): void {
    void (async () => {
      const logs = await window.clover.readLogs(200)
      const text = diagnosticsText() + (logs ? `\n\n--- recent log ---\n${logs}` : '')
      await window.navigator.clipboard.writeText(redactEmails(text))
      setDiagnosticsCopied(true)
      setTimeout(() => setDiagnosticsCopied(false), 2000)
    })()
  }

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
  const [sigLinkOpen, setSigLinkOpen] = useState(false)
  const savedSigRangeRef = useRef<Range | null>(null)
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

  const [licensesOpen, setLicensesOpen] = useState(false)
  const [licensesText, setLicensesText] = useState<string | null>(null)
  const updateStatus = useUpdate((s) => s.status)
  const updateVersion = useUpdate((s) => s.version)
  const updatePercent = useUpdate((s) => s.percent)
  const updateError = useUpdate((s) => s.error)
  const customApps = useApps((s) => s.apps)
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
                : updateStatus === 'managed'
                  ? 'Updates are managed by Flatpak/Snap'
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
    let cancelled = false
    void (async () => {
      const sig = (await window.clover.settings.get(`signature.${sigAccountId}`)) as
        | { html?: string; enabled?: boolean }
        | undefined
      if (cancelled) return
      setSigEnabled(sig?.enabled !== false)
      if (sigEditorRef.current) sigEditorRef.current.innerHTML = sig?.html ?? ''
    })()
    return () => {
      cancelled = true
    }
    // Re-load when the Mail tab mounts the editor (it only exists on that tab).
  }, [sigAccountId, tab])

  /** Trim trailing separators ( | • · ) and stray line breaks so a signature
   *  never ends with a dangling pipe. */
  function cleanSignatureTrailing(): void {
    const editor = sigEditorRef.current
    if (!editor) return
    let node: ChildNode | null = editor.lastChild
    while (node) {
      if (node.nodeType === 1 && (node as HTMLElement).tagName === 'BR') {
        const prev = node.previousSibling
        node.remove()
        node = prev
        continue
      }
      if (node.nodeType === 3) {
        const text = (node.textContent ?? '').replace(/[\s\u00a0|•·]+$/, '')
        if (text.trim()) {
          node.textContent = text
          return
        }
        const prev = node.previousSibling
        node.remove()
        node = prev
        continue
      }
      return
    }
  }

  function applySignatureTemplate(kind: 'simple' | 'role' | 'contact'): void {
    const editor = sigEditorRef.current
    if (!editor) return
    const account = accounts.find((a) => a.id === sigAccountId)
    const name = account?.displayName?.trim() || 'Your Name'
    const email = account?.email || 'you@example.com'
    const domain = email.includes('@') ? email.split('@')[1] : ''
    const esc = (value: string): string =>
      value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const html =
      kind === 'simple'
        ? `<p><strong>${esc(name)}</strong><br>${esc(email)}</p>`
        : kind === 'role'
          ? `<p><strong>${esc(name)}</strong><br>Role · Company</p><p>📞 phone<br>🌐 ${esc(domain)}<br>✉️ ${esc(email)}</p>`
          : `<p><strong>${esc(name)}</strong><br>Company</p><hr><p>📞 phone&nbsp;&nbsp;🌐 ${esc(domain)}<br>✉️ ${esc(email)}</p>`
    editor.innerHTML = html
    setSigMsg(null)
  }

  async function saveSignature(): Promise<void> {
    if (!sigAccountId) return
    cleanSignatureTrailing()
    await window.clover.settings.set(`signature.${sigAccountId}`, {
      html: sigEditorRef.current?.innerHTML ?? '',
      enabled: sigEnabled
    })
    setSigMsg('Signature saved.')
  }

  function onSigImage(event: ChangeEvent<HTMLInputElement>): void {
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
    const editor = sigEditorRef.current
    if (!editor) return
    const selection = window.getSelection()
    savedSigRangeRef.current =
      selection && selection.rangeCount > 0 && editor.contains(selection.anchorNode)
        ? selection.getRangeAt(0).cloneRange()
        : null
    setSigLinkOpen(true)
  }

  function applySigLink(url: string): void {
    setSigLinkOpen(false)
    const clean = url.trim()
    if (!clean) return
    const href = /^[a-z]+:/i.test(clean) ? clean : `https://${clean}`
    const editor = sigEditorRef.current
    if (!editor) return
    editor.focus()
    const selection = window.getSelection()
    if (savedSigRangeRef.current && selection) {
      selection.removeAllRanges()
      selection.addRange(savedSigRangeRef.current)
    }
    if (selection?.toString()) {
      document.execCommand('createLink', false, href)
    } else {
      const safe = href.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
      const label = clean.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      document.execCommand('insertHTML', false, `<a href="${safe}">${label}</a>&nbsp;`)
    }
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

  return {
    mode,
    accent,
    customAccent,
    setMode,
    setAccent,
    setCustomAccent,
    importTheme,
    backupAttachments,
    setBackupAttachments,
    backupBusy,
    backupMsg,
    importBusy,
    importMsg,
    diagnosticsCopied,
    openBugReport,
    copyDiagnostics,
    runImportMbox,
    runExport,
    runImport,
    info,
    blockRemote,
    toggleBlockRemote,
    dictationEnabled,
    setDictationEnabled,
    ai,
    aiStatus,
    apiKey,
    setApiKey,
    saveKey,
    patchAi,
    mcp,
    mcpRunning,
    setMcpRunning,
    patchMcp,
    accounts,
    sigAccountId,
    setSigAccountId,
    sigEnabled,
    setSigEnabled,
    sigMsg,
    sigEditorRef,
    sigFileRef,
    sigLinkOpen,
    setSigLinkOpen,
    applySigLink,
    onSigImage,
    execSig,
    sigLink,
    applySignatureTemplate,
    saveSignature,
    aliasAccountId,
    setAliasAccountId,
    aliasList,
    aliasEmail,
    setAliasEmail,
    aliasName,
    setAliasName,
    aliasDefault,
    makeDefaultFrom,
    addAliasEntry,
    removeAliasEntry,
    snippetList,
    snippetName,
    setSnippetName,
    snippetBody,
    setSnippetBody,
    addSnippetEntry,
    removeSnippetEntry,
    googleClientId,
    setGoogleClientId,
    googleSecret,
    setGoogleSecret,
    googleMsg,
    saveGoogleConfig,
    msClientId,
    setMsClientId,
    msSecret,
    setMsSecret,
    msMsg,
    saveMicrosoftConfig,
    licensesOpen,
    setLicensesOpen,
    licensesText,
    setLicensesText,
    updateStatus,
    updateVersion,
    downloadUpdate,
    installUpdate,
    updateText,
    checkUpdates,
    customApps
  }
}

export type SettingsScope = ReturnType<typeof useSettingsState>
