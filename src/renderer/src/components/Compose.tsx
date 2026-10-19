import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import DOMPurify from 'dompurify'
import type { Lint, LocalLinter, Suggestion } from 'harper.js'
import type { ComposeInput, DraftData, Snippet } from '@shared/mail'
import { SETTINGS_KEYS } from '@shared/theme'
import { useMail } from '../state/mail'
import { useComposeSession } from '../state/compose'
import { useToasts } from '../state/toasts'
import { IconCheck, IconClose, IconHighlight, IconMic, IconPaperclip, IconPopOut, IconRefresh, IconSend, IconSignature, IconTrash } from './icons'
import { LinkDialog } from './LinkDialog'
import { linkifyElement } from '../lib/linkify'
import { splitAddresses } from '@shared/addresses'
import { RecipientInput } from './RecipientInput'

const SIGNATURE_ATTR = 'data-clover-signature'

// The save started when a composer was hidden (switching views); a restored
// composer waits for it and reuses its draft UID.
let pendingFlush: Promise<number | null> = Promise.resolve(null)
const QUOTE_ATTR = 'data-clover-quote'

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

// Split on commas/semicolons only, so "Ann Lee <ann@x.com>" stays one recipient
// (splitting on spaces too used to turn it into "Ann", "Lee" and "<ann@x.com>").
function parseList(value: string): string[] {
  return splitAddresses(value)
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
  popout,
  initialFromEmail,
  initialTo,
  initialCc,
  initialBcc,
  initialHtml,
  initialDirty,
  initialSubject,
  initialBody,
  initialDraftUid,
  initialQuote,
  inReplyTo,
  references,
  initialAttachments
}: {
  accountId: string
  accountEmail?: string
  onClose: () => void
  /** Running in its own window: closing it closes the window. */
  popout?: boolean
  initialFromEmail?: string
  initialTo?: string
  initialCc?: string
  initialBcc?: string
  /** Editor HTML to restore as-is (a reopened draft, or after switching views). */
  initialHtml?: string
  /** Restoring a message that already had unsaved edits. */
  initialDirty?: boolean
  initialSubject?: string
  initialBody?: string
  /** Editing an existing draft: its UID, so autosave/send update or remove it. */
  initialDraftUid?: number
  initialQuote?: string
  inReplyTo?: string
  references?: string
  initialAttachments?: { name: string; path: string }[]
}): ReactNode {
  const send = useMail((s) => s.send)
  const [to, setTo] = useState(initialTo ?? '')
  const [cc, setCc] = useState(initialCc ?? '')
  const [bcc, setBcc] = useState(initialBcc ?? '')
  // Show the Cc/Bcc rows up front when a reply already has Cc recipients,
  // otherwise reply-all looks like it only selected one person.
  const [showCc, setShowCc] = useState(Boolean(initialCc || initialBcc))
  const [subject, setSubject] = useState(initialSubject ?? '')
  const [attachments, setAttachments] = useState<{ name: string; path: string }[]>(
    initialAttachments ?? []
  )
  const attachmentsRef = useRef(attachments)
  attachmentsRef.current = attachments
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editorRef = useRef<HTMLDivElement>(null)

  /**
   * Plain-text body. A collapsed quote is `display:none`, which innerText skips,
   * so expand collapsed blocks just long enough to read them (the quote must
   * still be sent as text).
   */
  function editorText(): string {
    const editor = editorRef.current
    if (!editor) return ''
    const collapsed = Array.from(editor.querySelectorAll('[data-collapsed]'))
    collapsed.forEach((el) => el.removeAttribute('data-collapsed'))
    const text = editor.innerText
    collapsed.forEach((el) => el.setAttribute('data-collapsed', '1'))
    return text
  }
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [grammarOpen, setGrammarOpen] = useState(false)
  const [grammarBusy, setGrammarBusy] = useState(false)
  const [grammarError, setGrammarError] = useState<string | null>(null)
  const [issues, setIssues] = useState<GrammarIssue[]>([])
  const [signatureHtml, setSignatureHtml] = useState('')
  const [signatureOn, setSignatureOn] = useState(false)
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [snippetOpen, setSnippetOpen] = useState(false)
  const [dictating, setDictating] = useState(false)
  const [partial, setPartial] = useState('')
  const [dictationError, setDictationError] = useState<string | null>(null)
  const [micSupported, setMicSupported] = useState(false)
  const [dictationOn, setDictationOn] = useState(false)
  const [laterOpen, setLaterOpen] = useState(false)
  const [quoteCollapsed, setQuoteCollapsed] = useState(Boolean(initialQuote))
  const [linkOpen, setLinkOpen] = useState(false)
  const savedRangeRef = useRef<Range | null>(null)

  useEffect(() => {
    void window.clover.mail.listSnippets().then(setSnippets)
  }, [])

  function insertSnippet(body: string): void {
    editorRef.current?.focus()
    document.execCommand('insertHTML', false, body)
  }
  const [fromOptions, setFromOptions] = useState<{ name: string | null; email: string }[]>([])
  const [fromEmail, setFromEmail] = useState(accountEmail ?? '')
  const [pending, setPending] = useState<{ input: ComposeInput; seconds: number } | null>(null)
  const pendingRef = useRef<{ input: ComposeInput; seconds: number } | null>(null)
  pendingRef.current = pending
  const sentRef = useRef(false)
  // Moved to its own window: this one no longer saves anything.
  const handedOffRef = useRef(false)
  const dropRef = useRef<Promise<void>>(Promise.resolve())
  const draftUidRef = useRef<number | null>(initialDraftUid ?? null)
  const draftRef = useRef<() => DraftData>(() => ({ to: [], subject: '' }))
  draftRef.current = () => ({
    to: parseList(to),
    cc: parseList(cc),
    bcc: parseList(bcc),
    subject,
    text: editorText(),
    html: (editorRef.current?.innerHTML ?? '').trim() || undefined,
    fromEmail: fromEmail || undefined,
    fromName: fromOptions.find((o) => o.email === fromEmail)?.name ?? undefined
  })

  // Drafts: saved only once you've actually edited something (an untouched new
  // message holds just the signature), only when it changed since the last save,
  // and one save at a time so a slow save can't leave a duplicate behind.
  const dirtyRef = useRef(Boolean(initialDirty))
  const discardedRef = useRef(false)
  const lastSavedRef = useRef('')
  const saveChainRef = useRef<Promise<void>>(
    // A message restored after switching views may still be finishing the save
    // that ran when it was hidden; adopt that draft instead of making another.
    pendingFlush.then((uid) => {
      if (uid && initialHtml !== undefined && draftUidRef.current === null) draftUidRef.current = uid
    })
  )
  function saveDraftNow(): Promise<void> {
    if (!dirtyRef.current || sentRef.current || discardedRef.current || handedOffRef.current) {
      return saveChainRef.current
    }
    const draft = draftRef.current()
    const key = JSON.stringify(draft)
    if (key === lastSavedRef.current) return saveChainRef.current
    lastSavedRef.current = key
    saveChainRef.current = saveChainRef.current.then(async () => {
      if (sentRef.current || discardedRef.current) return
      try {
        const uid = await window.clover.mail.saveDraft(accountId, draft, draftUidRef.current)
        if (uid) draftUidRef.current = uid
      } catch {
        lastSavedRef.current = '' // try again next time
      }
    })
    return saveChainRef.current
  }

  // Anything the user changes marks the message as edited.
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    dirtyRef.current = true
  }, [to, cc, bcc, subject, attachments])

  // Autosave the draft to the server Drafts folder while composing.
  useEffect(() => {
    const interval = setInterval(() => {
      if (pending) return
      void saveDraftNow()
    }, 7000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, pending])

  function refreshDrafts(): void {
    const draftsFolder = useMail.getState().folders.find((f) => f.specialUse === 'drafts')
    if (draftsFolder) void window.clover.mail.syncFolder(draftsFolder.id).catch(() => undefined)
  }

  /** Remove the server draft once any save still in flight has finished. */
  function dropDraft(): void {
    dropRef.current = saveChainRef.current.then(async () => {
      const uid = draftUidRef.current
      draftUidRef.current = null
      if (uid) await window.clover.mail.deleteDraft(accountId, uid).catch(() => undefined)
      refreshDrafts()
    })
  }

  // Leaving the composer never loses work. Closing it (X, Escape) saves what
  // you wrote to Drafts; switching to Calendar/People keeps it open and brings
  // it back, exactly as it was, when you return to Mail. Layout effect: the
  // editor element is still attached when this cleanup runs.
  useLayoutEffect(() => {
    return () => {
      // A compose window saves when it closes (closeWindow), not on unmount.
      if (sentRef.current || discardedRef.current || handedOffRef.current || popout) return
      const html = editorRef.current?.innerHTML
      const draft = draftRef.current()
      const stillOpen = useComposeSession.getState().state.open
      const edited = dirtyRef.current
      const flush = saveDraftNow().then(() => draftUidRef.current)
      pendingFlush = flush
      if (stillOpen) {
        const session = useComposeSession.getState().state
        useComposeSession.getState().set({
          ...session,
          to: draft.to.join(', '),
          cc: (draft.cc ?? []).join(', '),
          bcc: (draft.bcc ?? []).join(', '),
          subject: draft.subject,
          html: html ?? session.html,
          quote: undefined,
          body: undefined,
          attachments: attachmentsRef.current,
          draftUid: draftUidRef.current ?? session.draftUid,
          dirty: edited
        })
      } else if (edited) {
        void flush.then(() => {
          refreshDrafts()
          // lastSavedRef is cleared when a save fails.
          useToasts.getState().push(
            lastSavedRef.current
              ? { message: 'Saved to Drafts', kind: 'info' }
              : { message: "Couldn't save your draft to the server", kind: 'error' }
          )
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!pending) return
    if (pending.seconds <= 0) {
      if (sentRef.current) return
      sentRef.current = true
      void (async () => {
        setBusy(true)
        try {
          await send(pending.input)
          // Remove its draft (after any save still in flight) and reflect that
          // in the Drafts folder.
          dropDraft()
          closeRef.current()
        } catch (err) {
          setError((err as Error).message)
          setBusy(false)
          setPending(null)
          sentRef.current = false
        }
      })()
      return
    }
    const timer = setTimeout(
      () => setPending((p) => (p ? { ...p, seconds: p.seconds - 1 } : p)),
      1000
    )
    return () => clearTimeout(timer)
  }, [pending, send, onClose])

  // If the composer is closed while the undo countdown is still running, send
  // the message instead of silently dropping it (Undo is an explicit action).
  useEffect(() => {
    return () => {
      const active = pendingRef.current
      if (active && !sentRef.current) {
        sentRef.current = true
        void send(active.input).catch(() => undefined)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void (async () => {
      const [list, defaultFrom] = await Promise.all([
        window.clover.mail.listAliases(accountId),
        window.clover.mail.getDefaultFrom(accountId)
      ])
      const options = [
        { name: null as string | null, email: accountEmail ?? '' },
        ...list.map((a) => ({ name: a.name, email: a.email }))
      ]
      setFromOptions(options)
      // Only use the saved default if the address still exists on this account.
      const wanted = initialFromEmail || defaultFrom
      const valid = wanted && options.some((o) => o.email === wanted)
      setFromEmail(valid && wanted ? wanted : accountEmail ?? '')
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, accountEmail])

  // Put the signature directly under the user's text — above the quoted original,
  // like Gmail/Outlook — instead of at the very end of a long thread.
  function insertSignature(html: string): void {
    const editor = editorRef.current
    if (!editor || editor.querySelector(`[${SIGNATURE_ATTR}]`)) return
    const block = document.createElement('div')
    block.setAttribute(SIGNATURE_ATTR, '1')
    block.innerHTML = `<br>${html}`
    const quote = editor.querySelector(`[${QUOTE_ATTR}]`)
    if (quote) editor.insertBefore(block, quote)
    else editor.appendChild(block)
    setSignatureOn(true)
  }

  useEffect(() => {
    void (async () => {
      const sig = (await window.clover.settings.get(`signature.${accountId}`)) as
        | { html?: string; enabled?: boolean }
        | undefined
      if (sig?.enabled && sig.html) {
        setSignatureHtml(sig.html)
        insertSignature(sig.html)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId])

  function toggleSignature(): void {
    const editor = editorRef.current
    if (!editor) return
    const existing = editor.querySelector(`[${SIGNATURE_ATTR}]`)
    if (existing) {
      existing.remove()
      setSignatureOn(false)
    } else if (signatureHtml) {
      insertSignature(signatureHtml)
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

  const startHtml = useMemo(() => {
    // Draft HTML can come from other mail apps: strip anything active from it.
    if (initialHtml !== undefined) return DOMPurify.sanitize(initialHtml)
    const body = initialBody
      ? escapeHtml(initialBody).replace(/&gt;/g, '>').replace(/\n/g, '<br>')
      : ''
    if (initialQuote) return `${body || '<div><br></div>'}${initialQuote}`
    return body
  }, [initialBody, initialQuote, initialHtml])

  // Reflect the quote's collapsed/expanded state on the editable quote block.
  useEffect(() => {
    const quote = editorRef.current?.querySelector(`[${QUOTE_ATTR}]`)
    if (!quote) return
    if (quoteCollapsed) quote.setAttribute('data-collapsed', '1')
    else quote.removeAttribute('data-collapsed')
  }, [quoteCollapsed])

  // For replies, put the caret at the top of the composer so you can type right away.
  useEffect(() => {
    if (!initialQuote) return
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    const selection = window.getSelection()
    if (!selection) return
    const range = document.createRange()
    range.selectNodeContents(editor)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function exec(command: string, value?: string): void {
    editorRef.current?.focus()
    document.execCommand(command, false, value)
  }

  function addLink(): void {
    const editor = editorRef.current
    if (!editor) return
    const selection = window.getSelection()
    savedRangeRef.current =
      selection && selection.rangeCount > 0 && editor.contains(selection.anchorNode)
        ? selection.getRangeAt(0).cloneRange()
        : null
    setLinkOpen(true)
  }

  function applyLink(url: string): void {
    setLinkOpen(false)
    const clean = url.trim()
    if (!clean) return
    const href = /^[a-z]+:/i.test(clean) ? clean : `https://${clean}`
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    const selection = window.getSelection()
    if (savedRangeRef.current && selection) {
      selection.removeAllRanges()
      selection.addRange(savedRangeRef.current)
    }
    const selected = selection?.toString() ?? ''
    if (selected) {
      document.execCommand('createLink', false, href)
    } else {
      const safe = href.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
      const label = clean.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      document.execCommand('insertHTML', false, `<a href="${safe}">${label}</a>&nbsp;`)
    }
  }

  function buildInput(): ComposeInput {
    const html = editorRef.current?.innerHTML ?? ''
    const text = editorText()
    return {
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
    }
  }

  function laterUntil(kind: 'hour' | 'tonight' | 'tomorrow'): number {
    const d = new Date()
    if (kind === 'hour') d.setHours(d.getHours() + 1)
    else if (kind === 'tonight') {
      d.setHours(18, 0, 0, 0)
      if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1)
    } else {
      d.setDate(d.getDate() + 1)
      d.setHours(8, 0, 0, 0)
    }
    return d.getTime()
  }

  function sendLater(kind: 'hour' | 'tonight' | 'tomorrow'): void {
    if (!to.trim()) {
      setError('Add at least one recipient.')
      return
    }
    sentRef.current = true
    dropRef.current = window.clover.mail
      .scheduleSend(buildInput(), laterUntil(kind))
      .then(() => {
        dropDraft()
        return dropRef.current
      })
      .catch((err: Error) => {
        useToasts.getState().push({ message: `Couldn't schedule the message: ${err.message}`, kind: 'error' })
      })
    closeRef.current()
  }

  function addFiles(files: FileList | File[]): void {
    const list = Array.from(files)
    if (list.length === 0) return
    const picked = list.map((f) => ({ name: f.name, path: window.clover.getFilePath(f) }))
    setAttachments((prev) => [...prev, ...picked])
  }

  useEffect(() => {
    void window.clover.dictation.supported().then(setMicSupported)
    void window.clover.settings
      .get(SETTINGS_KEYS.dictationEnabled)
      .then((value) => setDictationOn(value === true))
  }, [])

  useEffect(() => {
    if (!dictating) return
    const off = window.clover.dictation.onEvent((event) => {
      if (event.type === 'partial') {
        setPartial(event.text ?? '')
      } else if (event.type === 'result') {
        setPartial('')
        insertDictatedText(event.text ?? '')
      } else if (event.type === 'error') {
        setDictationError(event.text ?? 'Dictation stopped')
        setDictating(false)
      }
    })
    return off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dictating])

  useEffect(() => {
    return () => {
      window.clover.dictation.stop()
    }
  }, [])

  function insertDictatedText(text: string): void {
    const trimmed = text.trim()
    if (!trimmed) return
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    const selection = window.getSelection()
    if (!selection || !editor.contains(selection.anchorNode)) {
      const range = document.createRange()
      range.selectNodeContents(editor)
      range.collapse(false)
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
    document.execCommand('insertText', false, `${trimmed} `)
  }

  async function toggleDictation(): Promise<void> {
    if (dictating) {
      window.clover.dictation.stop()
      setDictating(false)
      setPartial('')
      return
    }
    setDictationError(null)
    setPartial('')
    const result = await window.clover.dictation.start()
    if (!result.ok) {
      setDictationError(result.error ?? 'Could not start dictation')
      return
    }
    setDictating(true)
  }

  /** Move this message into its own window, keeping the same draft. */
  async function popOut(): Promise<void> {
    if (pendingRef.current || handedOffRef.current) return
    handedOffRef.current = true
    // Let a save in flight finish so the new window updates that draft.
    await saveChainRef.current
    window.clover.openComposeWindow({
      accountId,
      accountEmail,
      fromEmail: fromEmail || undefined,
      to,
      cc,
      bcc,
      subject,
      html: editorRef.current?.innerHTML ?? '',
      attachments: attachmentsRef.current,
      inReplyTo,
      references,
      draftUid: draftUidRef.current ?? undefined,
      dirty: dirtyRef.current
    })
    onClose()
  }

  // In a compose window: closing (X, Escape, the window's own close button)
  // saves to Drafts first, and keeps the window open if that save fails.
  const closingRef = useRef(false)
  const failedOnceRef = useRef(false)
  async function closeWindow(): Promise<void> {
    if (closingRef.current) return
    const active = pendingRef.current
    if (active && !sentRef.current) {
      // Closed during the undo countdown: send it now (as the main window does).
      sentRef.current = true
      try {
        await send(active.input)
        dropDraft()
      } catch (err) {
        sentRef.current = false
        setPending(null)
        setError((err as Error).message)
        return
      }
    }
    const edited = dirtyRef.current && !sentRef.current && !discardedRef.current
    await saveDraftNow()
    await dropRef.current
    if (edited && !lastSavedRef.current && !failedOnceRef.current) {
      failedOnceRef.current = true
      useToasts.getState().push({
        message: "Couldn't save your draft to the server. Close again to discard it.",
        kind: 'error'
      })
      return
    }
    closingRef.current = true
    if (edited) refreshDrafts()
    window.clover.mailChanged()
    window.close()
  }
  const closeWindowRef = useRef(closeWindow)
  closeWindowRef.current = closeWindow
  const closeRef = useRef(onClose)
  closeRef.current = popout ? () => void closeWindowRef.current() : onClose

  useEffect(() => {
    if (!popout) return
    const beforeUnload = (e: BeforeUnloadEvent): void => {
      if (closingRef.current) return
      // Hold the window open until the draft is saved; closeWindow closes it.
      e.preventDefault()
      e.returnValue = false
      void closeWindowRef.current()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !e.defaultPrevented) void closeWindowRef.current()
    }
    window.addEventListener('beforeunload', beforeUnload)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      window.removeEventListener('keydown', onKey)
    }
  }, [popout])

  useEffect(() => {
    if (popout) document.title = subject.trim() || 'New message'
  }, [popout, subject])

  async function submit(): Promise<void> {
    if (!to.trim()) {
      setError('Add at least one recipient.')
      return
    }
    setError(null)
    setPending({ seconds: 8, input: buildInput() })
  }

  return (
    <div
      className={
        popout
          ? 'flex h-full w-full bg-surface'
          : 'absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm'
      }
      onKeyDown={(e) => {
        // Ctrl+Enter sends (Outlook, Gmail), from any field of the composer.
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !pending && !busy) {
          e.preventDefault()
          void submit()
        }
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        addFiles(e.dataTransfer.files)
      }}
    >
      <div
        className={
          popout
            ? 'flex h-full w-full flex-col overflow-hidden bg-surface'
            : 'animate-fade-in flex h-[74vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl'
        }
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-[14px] font-semibold text-ink">New message</h2>
          <div className="flex items-center gap-1">
            {!popout && !pending && (
              <button
                type="button"
                title="Open in its own window"
                aria-label="Open in its own window"
                onClick={() => void popOut()}
                className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/10"
              >
                <IconPopOut className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              title="Close (saves to Drafts)"
              aria-label="Close"
              onClick={() => closeRef.current()}
              className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/10"
            >
              <IconClose />
            </button>
          </div>
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
            <RecipientInput
              value={to}
              onChange={setTo}
              placeholder="Type a name or address"
              autoFocus={!initialTo}
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
                <RecipientInput value={cc} onChange={setCc} />
              </div>
              <div className="flex items-center gap-2 border-b border-line/70 py-1.5">
                <span className="w-10 text-[12px] text-muted">Bcc</span>
                <RecipientInput value={bcc} onChange={setBcc} />
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
              title="Highlight text"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                exec('styleWithCSS', 'true')
                exec('hiliteColor', '#fde68a')
              }}
              className="grid h-7 min-w-7 place-items-center rounded-md px-1.5 text-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/10"
            >
              <IconHighlight className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Remove highlight"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                exec('styleWithCSS', 'true')
                exec('hiliteColor', 'transparent')
              }}
              className="rounded-md px-1.5 py-1 text-[11px] text-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/10"
            >
              No highlight
            </button>
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
            {initialQuote && (
              <button
                type="button"
                onClick={() => setQuoteCollapsed((v) => !v)}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted hover:text-accent"
              >
                {quoteCollapsed ? '⋯ Show quoted text' : 'Hide quoted text'}
              </button>
            )}
            <div className="relative">
              <button
                type="button"
                onClick={() => setSnippetOpen((v) => !v)}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted hover:text-accent"
              >
                Snippet
              </button>
              {snippetOpen && (
                <div className="absolute left-0 top-8 z-50 w-56 overflow-hidden rounded-xl border border-line bg-surface py-1 text-ink shadow-2xl">
                  {snippets.length === 0 && (
                    <div className="px-3 py-1.5 text-[12px] text-muted">
                      No snippets — add them in Settings → Mail.
                    </div>
                  )}
                  {snippets.map((snippet) => (
                    <button
                      key={snippet.id}
                      type="button"
                      onClick={() => {
                        setSnippetOpen(false)
                        insertSnippet(snippet.body)
                      }}
                      className="block w-full px-3 py-1.5 text-left text-[12px] hover:bg-black/5 dark:hover:bg-white/10"
                    >
                      {snippet.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
            onInput={() => {
              dirtyRef.current = true
            }}
            onPaste={(e) => {
              const files = e.clipboardData.files
              if (files && files.length > 0) {
                e.preventDefault()
                addFiles(files)
              }
            }}
            onBlur={() => {
              const editor = editorRef.current
              if (editor) linkifyElement(editor)
            }}
            className="compose-editor mt-2 min-h-0 flex-1 overflow-y-auto bg-transparent text-[13.5px] leading-relaxed text-ink outline-none"
            dangerouslySetInnerHTML={{ __html: startHtml }}
          />

          {dictating && (
            <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-[12px] text-rose-500">
              <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
              <span className="font-medium">Listening…</span>
              {partial && <span className="truncate text-muted">{partial}</span>}
            </div>
          )}
          {dictationError && (
            <div className="mt-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[12px] text-amber-600">
              {dictationError}
            </div>
          )}

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
          {pending && (
            <span className="flex items-center gap-2 text-[12px] text-accent">
              Sending in {pending.seconds}s…
              <button
                type="button"
                onClick={() => setPending(null)}
                className="rounded-md border border-line px-2 py-0.5 text-muted hover:text-ink"
              >
                Undo
              </button>
            </span>
          )}
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
          <button
            type="button"
            title="Delete this message and its draft"
            onClick={() => {
              discardedRef.current = true
              dropDraft()
              closeRef.current()
            }}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] text-muted hover:text-rose-500"
          >
            <IconTrash className="h-4 w-4" />
            Discard
          </button>
          {micSupported && dictationOn && (
            <button
              type="button"
              onClick={() => void toggleDictation()}
              title={dictating ? 'Stop dictation' : 'Dictate a reply'}
              className={
                'flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] ' +
                (dictating ? 'text-rose-500' : 'text-muted hover:text-ink')
              }
            >
              <IconMic className="h-4 w-4" />
              {dictating ? 'Stop' : 'Dictate'}
            </button>
          )}
          {error && <span className="text-[12px] text-rose-500">{error}</span>}
          <div className="relative ml-auto">
            <button
              type="button"
              onClick={() => setLaterOpen((v) => !v)}
              disabled={busy}
              className="flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-[12px] text-muted hover:text-ink disabled:opacity-50"
            >
              Send later
            </button>
            {laterOpen && (
              <div className="absolute bottom-11 right-0 z-50 w-44 overflow-hidden rounded-xl border border-line bg-surface py-1 text-ink shadow-2xl">
                {(
                  [
                    ['In 1 hour', 'hour'],
                    ['Tonight (6pm)', 'tonight'],
                    ['Tomorrow morning', 'tomorrow']
                  ] as [string, 'hour' | 'tonight' | 'tomorrow'][]
                ).map(([label, kind]) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => {
                      setLaterOpen(false)
                      sendLater(kind)
                    }}
                    className="block w-full px-3 py-1.5 text-left text-[12px] hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink disabled:opacity-50"
          >
            {busy ? <IconRefresh className="h-4 w-4 animate-spin" /> : <IconSend className="h-4 w-4" />}
            {busy ? 'Sending…' : 'Send'}
          </button>
        </footer>
      </div>
      <LinkDialog open={linkOpen} onCancel={() => setLinkOpen(false)} onSubmit={applyLink} />
    </div>
  )
}
