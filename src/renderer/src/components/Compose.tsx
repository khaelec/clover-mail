import { useState, type ReactNode } from 'react'
import { useMail } from '../state/mail'
import { IconClose, IconPaperclip, IconRefresh, IconSend } from './icons'

function parseList(value: string): string[] {
  return value
    .split(/[,;\s]+/)
    .map((v) => v.trim())
    .filter(Boolean)
}

export function Compose({
  accountId,
  onClose,
  initialTo,
  initialSubject,
  initialBody,
  inReplyTo,
  references
}: {
  accountId: string
  onClose: () => void
  initialTo?: string
  initialSubject?: string
  initialBody?: string
  inReplyTo?: string
  references?: string
}): ReactNode {
  const send = useMail((s) => s.send)
  const [to, setTo] = useState(initialTo ?? '')
  const [cc, setCc] = useState('')
  const [bcc, setBcc] = useState('')
  const [showCc, setShowCc] = useState(false)
  const [subject, setSubject] = useState(initialSubject ?? '')
  const [body, setBody] = useState(initialBody ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(): Promise<void> {
    if (!to.trim()) {
      setError('Add at least one recipient.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await send({
        accountId,
        to: parseList(to),
        cc: parseList(cc),
        bcc: parseList(bcc),
        subject,
        text: body,
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
      <div className="animate-fade-in flex h-[70vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
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

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message…"
            className="mt-2 min-h-0 flex-1 resize-none bg-transparent text-[13.5px] leading-relaxed text-ink outline-none"
          />
        </div>

        <footer className="flex items-center gap-2 border-t border-line px-5 py-3">
          {error && <span className="text-[12px] text-rose-500">{error}</span>}
          <button type="button" className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] text-muted hover:text-ink" disabled>
            <IconPaperclip className="h-4 w-4" />
            Attach
          </button>
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
