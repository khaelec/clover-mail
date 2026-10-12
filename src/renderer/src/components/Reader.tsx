import DOMPurify from 'dompurify'
import type { ReactNode } from 'react'
import { useMail } from '../state/mail'
import { IconFlag, IconPaperclip, IconRefresh, IconReply, IconTrash } from './icons'

function formatDate(value: number | null): string {
  if (!value) return ''
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    })
  } catch {
    return ''
  }
}

function initials(name: string | null, email: string | null): string {
  const source = name || email || '?'
  return source.slice(0, 1).toUpperCase()
}

export function Reader({ onReply }: { onReply: () => void }): ReactNode {
  const { detail, toggleFlag, remove } = useMail()

  if (!detail) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-muted">
        {detail === null ? 'Select a message to read' : 'Loading…'}
      </div>
    )
  }

  const html = detail.htmlRaw ? DOMPurify.sanitize(detail.htmlRaw, { USE_PROFILES: { html: true } }) : null

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

      <div className="min-h-0 flex-1 overflow-y-auto">
        {detail.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 border-b border-line px-6 py-3">
            {detail.attachments.map((att) => (
              <span
                key={att.id}
                className="flex items-center gap-1.5 rounded-lg border border-line bg-canvas/50 px-2.5 py-1.5 text-[12px] text-ink"
              >
                <IconPaperclip className="h-3.5 w-3.5 text-muted" />
                {att.filename ?? 'attachment'}
              </span>
            ))}
          </div>
        )}

        {html ? (
          <div
            className="prose-clover px-6 py-5 text-[13.5px] leading-relaxed text-ink/90"
            dangerouslySetInnerHTML={{ __html: html }}
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
