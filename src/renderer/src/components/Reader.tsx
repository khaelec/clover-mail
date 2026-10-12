import DOMPurify from 'dompurify'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { SETTINGS_KEYS } from '@shared/theme'
import { useMail } from '../state/mail'
import { IconFlag, IconPaperclip, IconRefresh, IconReply, IconTrash } from './icons'

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

export function Reader({ onReply }: { onReply: () => void }): ReactNode {
  const { detail, toggleFlag, remove, markSpam, markNotSpam, blockSender, allowSender } = useMail()
  const [allowRemote, setAllowRemote] = useState(false)
  const [trusted, setTrusted] = useState<string[]>([])
  const [blockEnabled, setBlockEnabled] = useState(true)
  const [calendarNotice, setCalendarNotice] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const settings = await window.clover.settings.getAll()
      setBlockEnabled(settings[SETTINGS_KEYS.blockRemoteImages] !== false)
      setTrusted((settings[SETTINGS_KEYS.trustedSenders] as string[] | undefined) ?? [])
    })()
  }, [])

  useEffect(() => {
    setAllowRemote(false)
  }, [detail?.id])

  const sender = detail?.fromEmail?.toLowerCase() ?? ''
  const shouldBlock = blockEnabled && !allowRemote && !trusted.includes(sender)

  const rendered = useMemo(() => {
    if (!detail?.htmlRaw) return { html: null as string | null, blocked: 0 }
    const sanitized = sanitizeWithInlineImages(detail.htmlRaw, detail.inlineImages)
    if (!shouldBlock) return { html: sanitized, blocked: 0 }
    return blockRemoteImages(sanitized)
  }, [detail, shouldBlock])

  async function alwaysAllowSender(): Promise<void> {
    const next = Array.from(new Set([...trusted, sender]))
    setTrusted(next)
    setAllowRemote(true)
    await window.clover.settings.set(SETTINGS_KEYS.trustedSenders, next)
  }

  if (!detail) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-muted">
        Select a message to read
      </div>
    )
  }

  return (
    <article className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-start gap-3 border-b border-line px-6 py-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-accent/60 text-[13px] font-semibold text-accent-ink">
          {initials(detail.fromName, detail.fromEmail)}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold text-ink">{detail.subject || '(no subject)'}</h2>
          <p className="mt-0.5 truncate text-[12px] text-muted">
            <span className="text-ink/80">{detail.fromName || detail.fromEmail}</span>
            {detail.to.length > 0 && <> · to {detail.to.join(', ')}</>} · {formatDate(detail.dateUtc)}
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
            title="Delete"
            onClick={() => void remove(detail.id)}
            className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:text-rose-500"
          >
            <IconTrash />
          </button>
          <button
            type="button"
            onClick={onReply}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-accent-ink"
          >
            <IconReply className="h-3.5 w-3.5" />
            Reply
          </button>
        </div>
      </header>

      {rendered.blocked > 0 && (
        <div className="flex items-center gap-3 border-b border-line bg-amber-500/10 px-6 py-2 text-[12px] text-amber-600">
          <span>{rendered.blocked} remote image{rendered.blocked > 1 ? 's' : ''} blocked to protect your privacy.</span>
          <button type="button" onClick={() => setAllowRemote(true)} className="font-medium underline">
            Load images
          </button>
          <button type="button" onClick={alwaysAllowSender} className="font-medium underline">
            Always allow from {detail.fromEmail}
          </button>
        </div>
      )}

      {(detail.isSpam || detail.spamScore >= 30) && (
        <div
          className={
            'border-b border-line px-6 py-2.5 text-[12px] ' +
            (detail.isSpam ? 'bg-rose-500/10 text-rose-500' : 'bg-amber-500/10 text-amber-600')
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">
              {detail.isSpam ? 'Marked as spam' : 'Possible spam'} · score {detail.spamScore}/100
            </span>
            <span className="text-ink/60">{detail.spamReasons.slice(0, 3).join(' · ')}</span>
            <div className="ml-auto flex items-center gap-2">
              {!detail.isSpam && (
                <button
                  type="button"
                  onClick={() => void markSpam(detail.id)}
                  className="rounded-md border border-line px-2 py-1 hover:text-rose-500"
                >
                  Spam
                </button>
              )}
              {detail.isSpam && (
                <>
                  <button
                    type="button"
                    onClick={() => void markNotSpam(detail.id)}
                    className="rounded-md border border-line px-2 py-1 hover:text-accent"
                  >
                    Not spam
                  </button>
                  <button
                    type="button"
                    onClick={() => void allowSender(detail.fromEmail ?? '')}
                    className="rounded-md border border-line px-2 py-1 hover:text-accent"
                  >
                    Allow sender
                  </button>
                </>
              )}
              {!detail.isSpam && (
                <>
                  <button
                    type="button"
                    onClick={() => void markNotSpam(detail.id)}
                    className="rounded-md border border-line px-2 py-1 hover:text-accent"
                  >
                    Not spam
                  </button>
                  <button
                    type="button"
                    onClick={() => void blockSender(detail.fromEmail ?? '')}
                    className="rounded-md border border-line px-2 py-1 hover:text-rose-500"
                  >
                    Block sender
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {detail.attachments.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-6 py-3">
            {detail.attachments.map((att) => {
              const isIcs = (att.mimeType ?? '').includes('calendar') || (att.filename ?? '').toLowerCase().endsWith('.ics')
              return (
                <span key={att.id} className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={!att.available}
                    onClick={() => void window.clover.mail.downloadAttachment(att.id)}
                    title={att.available ? 'Save attachment' : 'Content not cached yet — open the message first'}
                    className={
                      'flex items-center gap-1.5 rounded-lg border border-line bg-canvas/50 px-2.5 py-1.5 text-[12px] ' +
                      (att.available ? 'text-ink hover:border-accent hover:text-accent' : 'text-muted opacity-60')
                    }
                  >
                    <IconPaperclip className="h-3.5 w-3.5" />
                    {att.filename ?? 'attachment'}
                    {att.size ? <span className="text-muted">· {Math.round(att.size / 1024)} KB</span> : null}
                  </button>
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
            {calendarNotice && <span className="text-[11px] text-accent">{calendarNotice}</span>}
          </div>
        )}

        {rendered.html ? (
          <div
            className="prose-clover px-6 py-5 text-[13.5px] leading-relaxed text-ink/90"
            dangerouslySetInnerHTML={{ __html: rendered.html }}
          />
        ) : detail.textPlain ? (
          <pre className="whitespace-pre-wrap px-6 py-5 font-sans text-[13.5px] leading-relaxed text-ink/90">
            {detail.textPlain}
          </pre>
        ) : (
          <div className="flex items-center gap-2 px-6 py-5 text-[13px] text-muted">
            <IconRefresh className="h-4 w-4 animate-spin" /> Loading message…
          </div>
        )}
      </div>
    </article>
  )
}
