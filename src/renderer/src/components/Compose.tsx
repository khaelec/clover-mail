import { useRef, useState, type ReactNode } from 'react'
import { useMail } from '../state/mail'
import { IconClose, IconPaperclip, IconRefresh, IconSend, IconTrash } from './icons'

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
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
        attachments: files.map((file) => ({
          filename: file.name,
          path: window.clover.getFilePath(file)
        })),
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
          </div>

          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            className="mt-2 min-h-0 flex-1 overflow-y-auto bg-transparent text-[13.5px] leading-relaxed text-ink outline-none"
            dangerouslySetInnerHTML={{ __html: initialHtml }}
          />

          {files.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t border-line/70 pt-2">
              {files.map((file, index) => (
                <span
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-1.5 rounded-lg border border-line bg-canvas/50 px-2.5 py-1.5 text-[12px] text-ink"
                >
                  <IconPaperclip className="h-3.5 w-3.5 text-muted" />
                  {file.name}
                  <button
                    type="button"
                    onClick={() => setFiles(files.filter((_, i) => i !== index))}
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
              if (e.target.files) setFiles([...files, ...Array.from(e.target.files)])
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
