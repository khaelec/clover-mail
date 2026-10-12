import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Lint, LocalLinter, Suggestion } from 'harper.js'
import { useMail } from '../state/mail'
import { IconCheck, IconClose, IconPaperclip, IconRefresh, IconSend, IconSignature, IconTrash } from './icons'

const SIGNATURE_MARKER = '<div data-clover-signature="1">'

let harperLinter: LocalLinter | null = null
async function getLinter(): Promise<LocalLinter> {
  if (!harperLinter) {
    const [{ LocalLinter: Ctor }, { binary }] = await Promise.all([
      import('harper.js'),
      import('harper.js/binary')
    ])
    const linter = new Ctor({ binary })
    await linter.setup()
    harperLinter = linter
  }
  return harperLinter
}

interface GrammarIssue {
  kind: string
  message: string
  lint: Lint
  suggestions: Suggestion[]
}

function parseList(value: string): string[] {
  return value
    .split(/[,;\s]+/)
    .map((v) => v.trim())
    .filter(Boolean)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

interface ToolbarButtonProps {
  label: string
  title: string
  onClick: () => void
  className?: string
}

function ToolbarButton({ label, title, onClick, className }: ToolbarButtonProps): ReactNode {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={
        'grid h-7 min-w-7 place-items-center rounded-md px-1.5 text-[12px] text-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/10 ' +
        (className ?? '')
      }
    >
      {label}
    </button>
  )
}

export function Compose({
  accountId,
  accountEmail,
  onClose,
  initialTo,
  initialSubject,
  initialBody,
  inReplyTo,
  references,
  initialAttachments
}: {
  accountId: string
  accountEmail?: string
  onClose: () => void
  initialTo?: string
  initialSubject?: string
  initialBody?: string
  inReplyTo?: string
  references?: string
  initialAttachments?: { name: string; path: string }[]
}): ReactNode {
  const send = useMail((s) => s.send)
  const [to, setTo] = useState(initialTo ?? '')
  const [cc, setCc] = useState('')
  const [bcc, setBcc] = useState('')
  const [showCc, setShowCc] = useState(false)
  const [subject, setSubject] = useState(initialSubject ?? '')
  const [attachments, setAttachments] = useState<{ name: string; path: string }[]>(
    initialAttachments ?? []
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [grammarOpen, setGrammarOpen] = useState(false)
  const [grammarBusy, setGrammarBusy] = useState(false)
  const [grammarError, setGrammarError] = useState<string | null>(null)
  const [issues, setIssues] = useState<GrammarIssue[]>([])
  const [signatureHtml, setSignatureHtml] = useState('')
  const [signatureOn, setSignatureOn] = useState(false)
  const [fromOptions, setFromOptions] = useState<{ name: string | null; email: string }[]>([])
  const [fromEmail, setFromEmail] = useState(accountEmail ?? '')

  useEffect(() => {
    void window.clover.mail.listAliases(accountId).then((list) => {
      setFromOptions([
        { name: null, email: accountEmail ?? '' },
        ...list.map((a) => ({ name: a.name, email: a.email }))
      ])
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, accountEmail])

  useEffect(() => {
    void (async () => {
      const sig = (await window.clover.settings.get(`signature.${accountId}`)) as
        | { html?: string; enabled?: boolean }
        | undefined
      if (sig?.enabled && sig.html) {
        setSignatureHtml(sig.html)
        const editor = editorRef.current
        if (editor) {
          editor.innerHTML += `${SIGNATURE_MARKER}<br>${sig.html}</div>`
          setSignatureOn(true)
        }
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId])

  function toggleSignature(): void {
    const editor = editorRef.current
    if (!editor) return
    const index = editor.innerHTML.indexOf(SIGNATURE_MARKER)
    if (index >= 0) {
      editor.innerHTML = editor.innerHTML.slice(0, index)
      setSignatureOn(false)
    } else if (signatureHtml) {
      editor.innerHTML += `${SIGNATURE_MARKER}<br>${signatureHtml}</div>`
      setSignatureOn(true)
    }
  }

  async function checkWriting(): Promise<void> {
    setGrammarOpen(true)
    setGrammarBusy(true)
    setGrammarError(null)
    try {
      const linter = await getLinter()
      const text = editorRef.current?.innerText ?? ''
      const lints = await linter.lint(text)
      setIssues(
        lints.slice(0, 60).map((lint) => ({
          kind: lint.lint_kind(),
          message: lint.message(),
          lint,
          suggestions: lint.suggestions()
        }))
      )
    } catch (error) {
      setGrammarError((error as Error).message)
    } finally {
      setGrammarBusy(false)
    }
  }

  async function applyIssue(index: number, suggestionIndex: number): Promise<void> {
    const issue = issues[index]
    const suggestion = issue?.suggestions[suggestionIndex]
    if (!issue || !suggestion || !editorRef.current) return
    const linter = await getLinter()
    const updated = await linter.applySuggestion(editorRef.current.innerText, issue.lint, suggestion)
    editorRef.current.innerHTML = escapeHtml(updated).replace(/\n/g, '<br>')
    await checkWriting()
  }

  const initialHtml = initialBody
    ? escapeHtml(initialBody)
        .replace(/&gt;/g, '>')
        .replace(/\n/g, '<br>')
    : ''

  function exec(command: string, value?: string): void {
    editorRef.current?.focus()
    document.execCommand(command, false, value)
  }

  function addLink(): void {
    const url = window.prompt('Link URL:')
    if (url) exec('createLink', url)
  }

  async function submit(): Promise<void> {
    if (!to.trim()) {
      setError('Add at least one recipient.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const html = editorRef.current?.innerHTML ?? ''
      const text = editorRef.current?.innerText ?? ''
      await send({
        accountId,
        to: parseList(to),
        cc: parseList(cc),
        bcc: parseList(bcc),
        subject,
        text,
        html: html.trim() ? html : undefined,
        fromEmail: fromEmail || undefined,
        fromName: fromOptions.find((o) => o.email === fromEmail)?.name ?? undefined,
        attachments: attachments.map((a) => ({ filename: a.name, path: a.path })),
        inReplyTo,
        references
      })
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm">
      <div className="animate-fade-in flex h-[74vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-[14px] font-semibold text-ink">New message</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/10"
          >
            <IconClose />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col px-5 py-3">
          {fromOptions.length > 1 && (
            <div className="flex items-center gap-2 border-b border-line/70 py-1.5">
              <span className="w-10 text-[12px] text-muted">From</span>
              <select
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                className="rounded-md border border-line bg-canvas/60 px-2 py-1 text-[13px] text-ink outline-none focus:border-accent"
              >
                {fromOptions.map((o) => (
                  <option key={o.email} value={o.email}>
                    {o.name ? `${o.name} <${o.email}>` : o.email}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center gap-2 border-b border-line/70 py-1.5">
            <span className="w-10 text-[12px] text-muted">To</span>
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="name@example.com"
              className="flex-1 bg-transparent text-[13px] text-ink outline-none"
            />
            {!showCc && (
              <button type="button" onClick={() => setShowCc(true)} className="text-[12px] text-muted hover:text-accent">
                Cc/Bcc
              </button>
            )}
          </div>
          {showCc && (
            <>
              <div className="flex items-center gap-2 border-b border-line/70 py-1.5">
                <span className="w-10 text-[12px] text-muted">Cc</span>
                <input value={cc} onChange={(e) => setCc(e.target.value)} className="flex-1 bg-transparent text-[13px] text-ink outline-none" />
              </div>
              <div className="flex items-center gap-2 border-b border-line/70 py-1.5">
                <span className="w-10 text-[12px] text-muted">Bcc</span>
                <input value={bcc} onChange={(e) => setBcc(e.target.value)} className="flex-1 bg-transparent text-[13px] text-ink outline-none" />
              </div>
            </>
          )}
          <div className="flex items-center gap-2 border-b border-line/70 py-1.5">
            <span className="w-10 text-[12px] text-muted">Subject</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="flex-1 bg-transparent text-[13px] font-medium text-ink outline-none"
            />
          </div>

          <div className="flex items-center gap-0.5 border-b border-line/70 py-1">
            <ToolbarButton label="B" title="Bold" onClick={() => exec('bold')} className="font-bold" />
            <ToolbarButton label="I" title="Italic" onClick={() => exec('italic')} className="italic" />
            <ToolbarButton label="U" title="Underline" onClick={() => exec('underline')} className="underline" />
            <span className="mx-1 h-4 w-px bg-line" />
            <ToolbarButton label="•" title="Bulleted list" onClick={() => exec('insertUnorderedList')} />
            <ToolbarButton label="1." title="Numbered list" onClick={() => exec('insertOrderedList')} />
            <ToolbarButton label="❝" title="Quote" onClick={() => exec('formatBlock', 'blockquote')} />
            <ToolbarButton label="🔗" title="Insert link" onClick={addLink} />
            <ToolbarButton label="⌫" title="Clear formatting" onClick={() => exec('removeFormat')} />
            <span className="mx-1 h-4 w-px bg-line" />
            <button
              type="button"
              onClick={() => void checkWriting()}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted hover:text-accent"
            >
              <IconCheck className="h-3.5 w-3.5" />
              Check writing
            </button>
            <button
              type="button"
              onClick={toggleSignature}
              className={
                'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] ' +
                (signatureOn ? 'text-accent' : 'text-muted hover:text-accent')
              }
            >
              <IconSignature className="h-3.5 w-3.5" />
              Signature
            </button>
          </div>

          {grammarOpen && (
            <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-line bg-canvas/50 p-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {grammarBusy ? 'Checking…' : `${issues.length} suggestion${issues.length === 1 ? '' : 's'}`}
                </span>
                <button type="button" onClick={() => setGrammarOpen(false)} className="text-muted hover:text-ink">
                  <IconClose className="h-3.5 w-3.5" />
                </button>
              </div>
              {grammarError && <div className="text-[11px] text-rose-500">{grammarError}</div>}
              {!grammarBusy && issues.length === 0 && !grammarError && (
                <div className="text-[12px] text-muted">No spelling or grammar issues found.</div>
              )}
              <ul className="space-y-1.5">
                {issues.map((issue, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px]">
                    <span className="mt-0.5 shrink-0 rounded bg-accent/12 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                      {issue.kind}
                    </span>
                    <span className="min-w-0 flex-1 text-ink/90">{issue.message}</span>
                    <span className="flex shrink-0 flex-wrap gap-1">
                      {issue.suggestions.slice(0, 3).map((s, si) => (
                        <button
                          key={si}
                          type="button"
                          onClick={() => void applyIssue(i, si)}
                          className="rounded border border-line px-1.5 py-0.5 text-[11px] text-ink hover:border-accent hover:text-accent"
                        >
                          {s.get_replacement_text() || '(remove)'}
                        </button>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            className="mt-2 min-h-0 flex-1 overflow-y-auto bg-transparent text-[13.5px] leading-relaxed text-ink outline-none"
            dangerouslySetInnerHTML={{ __html: initialHtml }}
          />

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t border-line/70 pt-2">
              {attachments.map((file, index) => (
                <span
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-1.5 rounded-lg border border-line bg-canvas/50 px-2.5 py-1.5 text-[12px] text-ink"
                >
                  <IconPaperclip className="h-3.5 w-3.5 text-muted" />
                  {file.name}
                  <button
                    type="button"
                    onClick={() => setAttachments(attachments.filter((_, i) => i !== index))}
                    className="text-muted hover:text-rose-500"
                  >
                    <IconTrash className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <footer className="flex items-center gap-2 border-t border-line px-5 py-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []).map((f) => ({
                name: f.name,
                path: window.clover.getFilePath(f)
              }))
              setAttachments((prev) => [...prev, ...picked])
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] text-muted hover:text-ink"
          >
            <IconPaperclip className="h-4 w-4" />
            Attach
          </button>
          {error && <span className="text-[12px] text-rose-500">{error}</span>}
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="ml-auto flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink disabled:opacity-50"
          >
            {busy ? <IconRefresh className="h-4 w-4 animate-spin" /> : <IconSend className="h-4 w-4" />}
            {busy ? 'Sending…' : 'Send'}
          </button>
        </footer>
      </div>
    </div>
  )
}
