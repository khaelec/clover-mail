import DOMPurify from 'dompurify'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { SETTINGS_KEYS } from '@shared/theme'
import { mediaUrl } from '@shared/wallpaper'
import { useTheme } from '../theme/theme'
import { useMail } from '../state/mail'
import { useAi } from '../state/ai'
import { useCalendar } from '../state/calendar'
import { useLayout } from '../state/layout'
import { IconCalendar, IconClose, IconDownload, IconFlag, IconForward, IconImportance, IconPaperclip, IconRefresh, IconReply, IconSparkles, IconTrash } from './icons'
import type { MessageDetail } from '@shared/mail'

const AI_ACTIONS: { label: string; prompt: string }[] = [
  {
    label: 'Summarize',
    prompt:
      'Summarize this email in a few bullets, then list any action items, deadlines, or dates.'
  },
  {
    label: 'Action items',
    prompt: 'List only the action items, deadlines, and dates mentioned in this email.'
  },
  {
    label: 'Draft a reply',
    prompt: 'Draft a concise, friendly reply to this email. Output only the reply text, no subject line.'
  },
  {
    label: 'Reply professionally',
    prompt: 'Draft a professional, concise reply to this email. Output only the reply text.'
  },
  {
    label: 'Explain simply',
    prompt: 'Explain what this email is about in plain, simple terms.'
  }
]

const SNOOZE_OPTIONS: { label: string; kind: 'later' | 'tomorrow' | 'week' }[] = [
  { label: 'Later today', kind: 'later' },
  { label: 'Tomorrow morning', kind: 'tomorrow' },
  { label: 'Next week', kind: 'week' }
]

function formatDate(value: number | null): string {
  if (!value) return ''
  try {
    return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return ''
  }
}

function initials(name: string | null, email: string | null): string {
  return (name || email || '?').slice(0, 1).toUpperCase()
}

function sanitizeWithInlineImages(
  htmlRaw: string,
  inlineImages: { contentId: string; dataUrl: string }[]
): string {
  let out = DOMPurify.sanitize(htmlRaw, { USE_PROFILES: { html: true } })
  for (const image of inlineImages) {
    out = out.split(`cid:${image.contentId}`).join(image.dataUrl)
  }
  return out
}

function securityLabel(kind: string): string {
  switch (kind) {
    case 'pgp-inline':
      return 'inline PGP'
    case 'pgp-mime':
      return 'PGP/MIME'
    case 'smime':
      return 'S/MIME'
    default:
      return 'security'
  }
}

function blockRemoteImages(html: string): { html: string; blocked: number } {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  let blocked = 0
  doc.querySelectorAll('img').forEach((el) => {
    const src = el.getAttribute('src') ?? ''
    if (/^https?:\/\//i.test(src)) {
      el.setAttribute('data-clover-remote', src)
      el.removeAttribute('src')
      if (!el.getAttribute('alt')) el.setAttribute('alt', '[image blocked]')
      blocked += 1
    }
  })
  return { html: doc.body.innerHTML, blocked }
}

/** One message's sanitized body, rendered in its own sandboxed frame. */
function MessageBody({
  detail,
  shouldBlock,
  onLoadImages,
  onAlwaysAllow,
  onLoad
}: {
  detail: MessageDetail
  shouldBlock: boolean
  onLoadImages: () => void
  onAlwaysAllow: () => void
  onLoad: () => void
}): ReactNode {
  const effective = useTheme((s) => s.effective)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const rendered = useMemo(() => {
    if (!detail.htmlRaw) return { html: null as string | null, blocked: 0 }
    const sanitized = sanitizeWithInlineImages(detail.htmlRaw, detail.inlineImages)
    if (!shouldBlock) return { html: sanitized, blocked: 0 }
    return blockRemoteImages(sanitized)
  }, [detail, shouldBlock])

  function sizeFrame(): void {
    const frame = iframeRef.current
    const doc = frame?.contentDocument
    if (!frame || !doc || !doc.body) return
    attachLinkHandler(doc)
    // Use the body's content height — documentElement.scrollHeight is clamped to
    // the frame's current viewport, so it can never shrink below the default.
    const height = Math.max(doc.body.scrollHeight, doc.body.offsetHeight)
    if (height > 0) frame.style.height = `${height}px`
  }

  // The frame is same-origin, so the parent can intercept link clicks and hand
  // them to the OS browser (the sandboxed frame can't open them itself).
  function attachLinkHandler(doc: Document): void {
    const flagged = doc as Document & { __cloverLinks?: boolean }
    if (flagged.__cloverLinks) return
    flagged.__cloverLinks = true
    doc.addEventListener('click', (event) => {
      const target = event.target as Element | null
      const anchor = target?.closest?.('a') as HTMLAnchorElement | null
      if (!anchor) return
      const href = anchor.href
      if (/^(https?:|mailto:)/i.test(href)) {
        event.preventDefault()
        window.open(href, '_blank')
      }
    })
  }

  // Re-measure when the frame's width changes (e.g. the pane is resized) so the
  // height always matches the content and no dark gap is left behind.
  useEffect(() => {
    const frame = iframeRef.current
    if (!frame) return
    let lastWidth = -1
    const observer = new ResizeObserver(() => {
      const width = frame.clientWidth
      if (width === 0 || width === lastWidth) return
      lastWidth = width
      sizeFrame()
    })
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const frame = iframeRef.current
    if (!frame) return
    const dark = effective === 'dark'
    const css = [
      `html{background:${dark ? '#0a0e13' : '#ffffff'}}`,
      'html,body{margin:0;padding:0}',
      "body{background:transparent;font-family:Inter,'Segoe UI',system-ui,sans-serif;font-size:13.5px;line-height:1.6;padding:18px 24px;word-break:break-word;overflow-wrap:anywhere}",
      'img{max-width:100%;height:auto}',
      dark ? '' : 'a{color:#2563eb}',
      `blockquote{border-left:3px solid ${dark ? '#3a4653' : '#d7dbe0'};margin:.5rem 0;padding-left:.75rem;color:${dark ? '#9aa7b4' : '#5b6572'}}`,
      'table{max-width:100%;border-collapse:collapse}',
      'pre{white-space:pre-wrap;word-break:break-word}',
      dark
        ? 'body{filter:invert(1) hue-rotate(180deg)} img,video,svg,canvas,[style*="background-image"]{filter:invert(1) hue-rotate(180deg)}'
        : ''
    ].join('')
    frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>${css}</style></head><body>${rendered.html ?? ''}</body></html>`
  }, [rendered.html, effective])

  return (
    <>
      {rendered.blocked > 0 && (
        <div className="flex items-center gap-3 border-b border-line bg-amber-500/10 px-6 py-2 text-[12px] text-amber-600">
          <span>
            {rendered.blocked} remote image{rendered.blocked > 1 ? 's' : ''} blocked to protect your privacy.
          </span>
          <button type="button" onClick={onLoadImages} className="font-medium underline">
            Load images
          </button>
          <button type="button" onClick={onAlwaysAllow} className="font-medium underline">
            Always allow from {detail.fromEmail}
          </button>
        </div>
      )}
      {rendered.html ? (
        <iframe
          ref={iframeRef}
          title="message-body"
          onLoad={sizeFrame}
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          className="w-full border-0 bg-transparent"
        />
      ) : detail.textPlain ? (
        <pre className="whitespace-pre-wrap px-6 py-5 font-sans text-[13.5px] leading-relaxed text-ink/90">
          {detail.textPlain}
        </pre>
      ) : (
        <div className="flex items-center gap-2 px-6 py-4 text-[13px] text-muted">
          <button
            type="button"
            onClick={onLoad}
            className="rounded-md border border-line px-2.5 py-1 text-muted hover:border-accent hover:text-accent"
          >
            Load message
          </button>
        </div>
      )}
    </>
  )
}

export function Reader({
  onReply,
  onReplyAll,
  onForward
}: {
  onReply: () => void
  onReplyAll: () => void
  onForward: () => void
}): ReactNode {
  const {
    detail,
    conversation,
    loadMessageBody,
    toggleFlag,
    toggleImportant,
    toggleRead,
    remove,
    markSpam,
    markNotSpam,
    blockSender,
    allowSender,
    folders,
    bulkIds,
    snooze
  } = useMail()
  const [allowRemote, setAllowRemote] = useState(false)
  const [trusted, setTrusted] = useState<string[]>([])
  const [blockEnabled, setBlockEnabled] = useState(true)
  const [calendarNotice, setCalendarNotice] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const effective = useTheme((s) => s.effective)
  const [menu, setMenu] = useState<{ x: number; y: number; mode: 'main' | 'move' | 'snooze' } | null>(
    null
  )
  const [aiOpen, setAiOpen] = useState(false)

  function snoozeUntil(kind: 'later' | 'tomorrow' | 'week'): number {
    const d = new Date()
    if (kind === 'later') {
      d.setHours(18, 0, 0, 0)
      if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1)
    } else if (kind === 'tomorrow') {
      d.setDate(d.getDate() + 1)
      d.setHours(8, 0, 0, 0)
    } else {
      d.setDate(d.getDate() + 7)
      d.setHours(8, 0, 0, 0)
    }
    return d.getTime()
  }
  const [preview, setPreview] = useState<{
    id: string
    name: string
    kind: 'image' | 'pdf' | 'text'
    url?: string
    text?: string
  } | null>(null)

  async function previewAttachment(att: {
    id: string
    filename: string | null
    mimeType: string | null
    available: boolean
  }): Promise<void> {
    if (!att.available) {
      await window.clover.mail.openAttachment(att.id)
      return
    }
    const mime = att.mimeType ?? ''
    const ext = (att.filename ?? '').split('.').pop()?.toLowerCase() ?? ''
    const name = att.filename ?? 'attachment'
    if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'svg'].includes(ext)) {
      const path = await window.clover.mail.getAttachmentPath(att.id)
      if (path) setPreview({ id: att.id, name, kind: 'image', url: mediaUrl(path) })
      else await window.clover.mail.openAttachment(att.id)
    } else if (mime === 'application/pdf' || ext === 'pdf') {
      const path = await window.clover.mail.getAttachmentPath(att.id)
      if (path) setPreview({ id: att.id, name, kind: 'pdf', url: mediaUrl(path) })
      else await window.clover.mail.openAttachment(att.id)
    } else if (
      mime.startsWith('text/') ||
      ['txt', 'csv', 'json', 'md', 'log', 'xml', 'html', 'htm', 'ics'].includes(ext)
    ) {
      const text = await window.clover.mail.readAttachmentText(att.id)
      setPreview({ id: att.id, name, kind: 'text', text: text ?? '(empty)' })
    } else {
      await window.clover.mail.openAttachment(att.id)
    }
  }

  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  useEffect(() => {
    void (async () => {
      const settings = await window.clover.settings.getAll()
      setBlockEnabled(settings[SETTINGS_KEYS.blockRemoteImages] === true)
      setTrusted((settings[SETTINGS_KEYS.trustedSenders] as string[] | undefined) ?? [])
    })()
  }, [detail?.id])

  useEffect(() => {
    setAllowRemote(false)
  }, [detail?.id])

  const sender = detail?.fromEmail?.toLowerCase() ?? ''
  const shouldBlock = blockEnabled && !allowRemote && !trusted.includes(sender)

  // The whole conversation, newest first (so the latest message is at the top and
  // you scroll down through history), with the focused message kept fresh.
  const messages = useMemo(() => {
    const base = conversation.length ? conversation : detail ? [detail] : []
    const withFocus = base.map((m) => (detail && m.id === detail.id ? detail : m))
    return [...withFocus].reverse()
  }, [conversation, detail])

  // Bring the selected message into view without aligning it to the very top
  // (which left empty space below the last message).
  useEffect(() => {
    const container = scrollRef.current
    if (!container || !detail) return
    const el = container.querySelector(`[data-message-id="${detail.id}"]`)
    if (el instanceof HTMLElement) el.scrollIntoView({ block: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.id, messages.length])

  // After the thread renders instantly (cached bodies only), fetch the rest of
  // the bodies one at a time in the background so the conversation fills in
  // without ever blocking the open.
  const loadingBodiesRef = useRef<Set<string>>(new Set())
  const autoLoadedRef = useRef(0)
  useEffect(() => {
    autoLoadedRef.current = 0
    loadingBodiesRef.current.clear()
  }, [detail?.id])
  useEffect(() => {
    if (autoLoadedRef.current >= 15) return
    const pending = messages.filter(
      (m) => !m.htmlRaw && !m.textPlain && !loadingBodiesRef.current.has(m.id)
    )
    // `messages` is newest-first, so load the most recent uncached body first.
    const next = pending[0]
    if (!next) return
    loadingBodiesRef.current.add(next.id)
    autoLoadedRef.current += 1
    void loadMessageBody(next.id).finally(() => loadingBodiesRef.current.delete(next.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages])

  async function alwaysAllowSender(email?: string | null): Promise<void> {
    const target = (email ?? sender).toLowerCase()
    if (!target) return
    const next = Array.from(new Set([...trusted, target]))
    setTrusted(next)
    setAllowRemote(true)
    await window.clover.settings.set(SETTINGS_KEYS.trustedSenders, next)
  }

  function addToCalendar(): void {
    if (!detail) return
    useCalendar.getState().requestDraft({
      summary: detail.subject || 'Email',
      description: (detail.textPlain ?? '').slice(0, 2000),
      location: ''
    })
    window.dispatchEvent(new Event('clover:open-calendar'))
  }

  async function trustSender(email?: string | null): Promise<void> {
    const target = (email ?? sender).toLowerCase()
    if (!target) return
    const next = Array.from(new Set([...trusted, target]))
    setTrusted(next)
    await window.clover.settings.set(SETTINGS_KEYS.trustedSenders, next)
    // Re-evaluate so the "Suspicious message" banner clears.
    await useMail.getState().refreshDetail()
  }

  function askCopilot(prompt: string): void {
    if (!detail) return
    const text = [
      `Subject: ${detail.subject ?? ''}`,
      `From: ${detail.fromName ?? ''} <${detail.fromEmail ?? ''}>`,
      `To: ${detail.to.join(', ')}`,
      '',
      detail.textPlain ?? '(HTML-only message)'
    ].join('\n')
    void (async () => {
      await useAi.getState().load()
      useAi.getState().setContext(detail.subject ?? 'Email', text)
      // Open the Copilot in the side panel next to the message, like the app dock.
      useLayout.getState().set({ dockOpen: true, dockKind: 'copilot' })
      void useLayout.getState().save()
      await useAi.getState().send(prompt)
    })()
  }

  if (!detail) {
    return (
      <div className="flex h-full min-w-0 flex-1 items-center justify-center text-[13px] text-muted">
        Select a message to read
      </div>
    )
  }

  return (
    <article
      className="flex min-w-0 flex-1 flex-col"
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu({
          x: Math.min(e.clientX, window.innerWidth - 220),
          y: Math.min(e.clientY, window.innerHeight - 300),
          mode: 'main'
        })
      }}
    >
      <header className="flex items-start gap-3 border-b border-line px-6 py-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-accent/60 text-[13px] font-semibold text-accent-ink">
          {initials(detail.fromName, detail.fromEmail)}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold text-ink">{detail.subject || '(no subject)'}</h2>
          <p className="mt-0.5 truncate text-[12px] text-muted">
            {messages.length > 1 ? (
              <>
                <span className="text-ink/80">{messages.length} messages</span> ·{' '}
                {formatDate(messages[messages.length - 1]?.dateUtc ?? detail.dateUtc)}
              </>
            ) : (
              <>
                <span className="text-ink/80">{detail.fromName || detail.fromEmail}</span>
                {detail.to.length > 0 && <> · to {detail.to.join(', ')}</>} · {formatDate(detail.dateUtc)}
              </>
            )}
          </p>
        </div>
        <div className="ml-auto flex gap-1.5">
          <button
            type="button"
            title="Flag"
            onClick={() => void toggleFlag(detail)}
            className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:text-amber-400"
          >
            <IconFlag className={detail.isFlagged ? 'text-amber-400' : ''} />
          </button>
          <button
            type="button"
            title="Mark important"
            onClick={() => void toggleImportant(detail)}
            className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:text-accent"
          >
            <IconImportance className={detail.isImportant ? 'text-accent' : ''} />
          </button>
          <button
            type="button"
            title="Delete"
            onClick={() => void remove(detail.id)}
            className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:text-rose-500"
          >
            <IconTrash />
          </button>
          <div className="relative">
            <button
              type="button"
              title="AI actions"
              onClick={() => setAiOpen((v) => !v)}
              className={
                'grid h-8 w-8 place-items-center rounded-lg border border-line ' +
                (aiOpen ? 'text-accent' : 'text-muted hover:text-accent')
              }
            >
              <IconSparkles />
            </button>
            {aiOpen && (
              <div className="absolute right-0 top-9 z-50 w-56 overflow-hidden rounded-xl border border-line bg-surface py-1 text-ink shadow-2xl">
                {AI_ACTIONS.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => {
                      setAiOpen(false)
                      askCopilot(action.prompt)
                    }}
                    className="block w-full px-3 py-1.5 text-left text-[12.5px] hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    {action.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setAiOpen(false)
                    const lang = window.prompt('Translate into which language?', 'Spanish')
                    if (lang) askCopilot(`Translate this email into ${lang}. Output only the translation.`)
                  }}
                  className="block w-full px-3 py-1.5 text-left text-[12.5px] hover:bg-black/5 dark:hover:bg-white/10"
                >
                  Translate…
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={addToCalendar}
            title="Add to calendar"
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12px] text-muted hover:text-accent"
          >
            <IconCalendar className="h-3.5 w-3.5" />
            Calendar
          </button>
          <button
            type="button"
            onClick={onReply}
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12px] text-muted hover:text-accent"
          >
            <IconReply className="h-3.5 w-3.5" />
            Reply
          </button>
          <button
            type="button"
            onClick={onReplyAll}
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12px] text-muted hover:text-accent"
          >
            <IconReply className="h-3.5 w-3.5" />
            Reply all
          </button>
          <button
            type="button"
            onClick={onForward}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-accent-ink"
          >
            <IconForward className="h-3.5 w-3.5" />
            Forward
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {messages.map((message) => (
          <div key={message.id} data-message-id={message.id} className="border-b border-line">
            {messages.length > 1 && (
              <div className="flex items-center gap-3 bg-canvas/20 px-6 py-3">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-accent/60 text-[12px] font-semibold text-accent-ink">
                  {initials(message.fromName, message.fromEmail)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-ink">
                    <span className="font-semibold">{message.fromName || message.fromEmail}</span>
                    {message.to.length > 0 && (
                      <span className="text-muted"> · to {message.to.join(', ')}</span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted">{formatDate(message.dateUtc)}</div>
                </div>
              </div>
            )}

            {message.phishing.suspicious && (
              <div className="flex items-start gap-3 border-b border-line bg-rose-500/10 px-6 py-2 text-[12px] text-rose-600">
                <span className="mt-0.5 shrink-0 font-semibold">Suspicious message</span>
                <span className="min-w-0 flex-1">
                  <span className="block">{message.phishing.reasons[0]}</span>
                  {message.phishing.reasons.length > 1 && (
                    <span className="mt-0.5 block text-rose-600/80">
                      {message.phishing.reasons.slice(1).join(' · ')}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => void trustSender(message.fromEmail)}
                  className="shrink-0 font-medium underline"
                >
                  Trust sender
                </button>
              </div>
            )}

            {(message.security.signed || message.security.encrypted) && (
              <div className="flex flex-wrap items-center gap-2 border-b border-line bg-accent/8 px-6 py-1.5 text-[12px] text-accent">
                <span className="font-semibold">
                  {message.security.encrypted ? 'Encrypted' : 'Signed'} message
                </span>
                <span className="text-muted">
                  {securityLabel(
                    message.security.encrypted ? message.security.encryption : message.security.signing
                  )}{' '}
                  detected — signature not verified
                </span>
              </div>
            )}

            {(message.isSpam || message.spamScore >= 30) && (
              <div
                className={
                  'flex flex-wrap items-center gap-2 border-b border-line px-6 py-1.5 text-[12px] ' +
                  (message.isSpam ? 'bg-rose-500/10 text-rose-500' : 'bg-amber-500/10 text-amber-600')
                }
              >
                <span className="font-semibold">
                  {message.isSpam ? 'Marked as spam' : 'Possible spam'} · score {message.spamScore}/100
                </span>
                <span className="text-ink/60">{message.spamReasons.slice(0, 3).join(' · ')}</span>
                <div className="ml-auto flex items-center gap-2">
                  {message.isSpam ? (
                    <button
                      type="button"
                      onClick={() => void markNotSpam(message.id)}
                      className="rounded-md border border-line px-2 py-0.5 hover:text-accent"
                    >
                      Not spam
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => void markSpam(message.id)}
                        className="rounded-md border border-line px-2 py-0.5 hover:text-rose-500"
                      >
                        Spam
                      </button>
                      <button
                        type="button"
                        onClick={() => void markNotSpam(message.id)}
                        className="rounded-md border border-line px-2 py-0.5 hover:text-accent"
                      >
                        Not spam
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {message.attachments.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-6 py-2.5">
                {message.attachments.map((att) => {
                  const isIcs =
                    (att.mimeType ?? '').includes('calendar') ||
                    (att.filename ?? '').toLowerCase().endsWith('.ics')
                  return (
                    <span key={att.id} className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void previewAttachment(att)}
                        title={att.available ? 'Open' : 'Content not cached yet — open the message first'}
                        className={
                          'flex items-center gap-1.5 rounded-lg border border-line bg-canvas/50 px-2.5 py-1.5 text-[12px] ' +
                          (att.available ? 'text-ink hover:border-accent hover:text-accent' : 'text-muted opacity-60')
                        }
                      >
                        <IconPaperclip className="h-3.5 w-3.5" />
                        {att.filename ?? 'attachment'}
                        {att.size ? <span className="text-muted">· {Math.round(att.size / 1024)} KB</span> : null}
                      </button>
                      {att.available && (
                        <button
                          type="button"
                          title="Save as…"
                          onClick={() => void window.clover.mail.downloadAttachment(att.id)}
                          className="grid h-7 w-7 place-items-center rounded-lg border border-line text-muted hover:text-accent"
                        >
                          <IconDownload className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {isIcs && (
                        <button
                          type="button"
                          onClick={() =>
                            void window.clover.calendar.importAttachment(att.id).then((r) =>
                              setCalendarNotice(`Added ${r.imported} event(s) to your calendar.`)
                            )
                          }
                          className="rounded-lg bg-accent/12 px-2.5 py-1.5 text-[11px] font-medium text-accent"
                        >
                          Add to calendar
                        </button>
                      )}
                    </span>
                  )
                })}
              </div>
            )}

            <MessageBody
              detail={message}
              shouldBlock={
                blockEnabled && !allowRemote && !trusted.includes((message.fromEmail ?? '').toLowerCase())
              }
              onLoadImages={() => setAllowRemote(true)}
              onAlwaysAllow={() => void alwaysAllowSender(message.fromEmail)}
              onLoad={() => void loadMessageBody(message.id)}
            />
          </div>
        ))}
        {calendarNotice && (
          <div className="px-6 py-2 text-[11px] text-accent">{calendarNotice}</div>
        )}
      </div>
      {menu && detail && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu(null)
            }}
          />
          <div
            className="fixed z-50 w-52 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-2xl text-ink"
            style={{ left: menu.x, top: menu.y }}
          >
            {menu.mode === 'main' ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    void toggleRead(detail)
                    setMenu(null)
                  }}
                  className="flex w-full items-center px-3 py-1.5 text-left text-[13px] hover:bg-black/5 dark:hover:bg-white/10"
                >
                  {detail.isRead ? 'Mark as unread' : 'Mark as read'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void toggleImportant(detail)
                    setMenu(null)
                  }}
                  className="flex w-full items-center px-3 py-1.5 text-left text-[13px] hover:bg-black/5 dark:hover:bg-white/10"
                >
                  {detail.isImportant ? 'Remove important' : 'Mark as important'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void toggleFlag(detail)
                    setMenu(null)
                  }}
                  className="flex w-full items-center px-3 py-1.5 text-left text-[13px] hover:bg-black/5 dark:hover:bg-white/10"
                >
                  {detail.isFlagged ? 'Unstar' : 'Star'}
                </button>
                <button
                  type="button"
                  onClick={() => setMenu({ ...menu, mode: 'snooze' })}
                  className="flex w-full items-center px-3 py-1.5 text-left text-[13px] hover:bg-black/5 dark:hover:bg-white/10"
                >
                  Snooze ›
                </button>
                <div className="my-1 h-px bg-line" />
                <button
                  type="button"
                  onClick={() => {
                    onForward()
                    setMenu(null)
                  }}
                  className="flex w-full items-center px-3 py-1.5 text-left text-[13px] hover:bg-black/5 dark:hover:bg-white/10"
                >
                  Forward
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void bulkIds([detail.id], 'archive')
                    setMenu(null)
                  }}
                  className="flex w-full items-center px-3 py-1.5 text-left text-[13px] hover:bg-black/5 dark:hover:bg-white/10"
                >
                  Archive
                </button>
                <button
                  type="button"
                  onClick={() => setMenu({ ...menu, mode: 'move' })}
                  className="flex w-full items-center px-3 py-1.5 text-left text-[13px] hover:bg-black/5 dark:hover:bg-white/10"
                >
                  Move to folder ›
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Move this message to Trash?')) void bulkIds([detail.id], 'trash')
                    setMenu(null)
                  }}
                  className="flex w-full items-center px-3 py-1.5 text-left text-[13px] text-rose-500 hover:bg-black/5 dark:hover:bg-white/10"
                >
                  Delete
                </button>
              </>
            ) : menu.mode === 'move' ? (
              <>
                <button
                  type="button"
                  onClick={() => setMenu({ ...menu, mode: 'main' })}
                  className="flex w-full items-center px-3 py-1.5 text-left text-[13px] hover:bg-black/5 dark:hover:bg-white/10"
                >
                  ‹ Back
                </button>
                <div className="my-1 h-px bg-line" />
                <div className="max-h-64 overflow-y-auto">
                  {folders.map((folder) => (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => {
                        void bulkIds([detail.id], 'move', folder.id)
                        setMenu(null)
                      }}
                      className="flex w-full items-center px-3 py-1.5 text-left text-[13px] hover:bg-black/5 dark:hover:bg-white/10"
                    >
                      {folder.name}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setMenu({ ...menu, mode: 'main' })}
                  className="flex w-full items-center px-3 py-1.5 text-left text-[13px] hover:bg-black/5 dark:hover:bg-white/10"
                >
                  ‹ Back
                </button>
                <div className="my-1 h-px bg-line" />
                {SNOOZE_OPTIONS.map((option) => (
                  <button
                    key={option.kind}
                    type="button"
                    onClick={() => {
                      void snooze(detail.id, snoozeUntil(option.kind))
                      setMenu(null)
                    }}
                    className="flex w-full items-center px-3 py-1.5 text-left text-[13px] hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    {option.label}
                  </button>
                ))}
                <div className="my-1 h-px bg-line" />
                <button
                  type="button"
                  onClick={() => {
                    void useMail.getState().unsnooze(detail.id)
                    setMenu(null)
                  }}
                  className="flex w-full items-center px-3 py-1.5 text-left text-[13px] text-muted hover:bg-black/5 dark:hover:bg-white/10"
                >
                  Remove snooze
                </button>
              </>
            )}
          </div>
        </>
      )}
      {preview && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm">
          <div className="flex h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
            <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
              <span className="truncate text-[13px] font-medium text-ink">{preview.name}</span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void window.clover.mail.openAttachment(preview.id)}
                  className="rounded-lg border border-line px-2.5 py-1 text-[12px] text-muted hover:text-ink"
                >
                  Open in app
                </button>
                <button
                  type="button"
                  onClick={() => void window.clover.mail.downloadAttachment(preview.id)}
                  className="rounded-lg border border-line px-2.5 py-1 text-[12px] text-muted hover:text-ink"
                >
                  Save as…
                </button>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:text-ink"
                >
                  <IconClose className="h-4 w-4" />
                </button>
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-auto bg-canvas/40">
              {preview.kind === 'image' && preview.url && (
                <img src={preview.url} className="mx-auto max-h-full max-w-full" />
              )}
              {preview.kind === 'pdf' && preview.url && (
                <iframe src={preview.url} title="pdf-preview" className="h-full w-full border-0" />
              )}
              {preview.kind === 'text' && (
                <pre className="whitespace-pre-wrap p-4 text-[12.5px] text-ink">{preview.text}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  )
}
