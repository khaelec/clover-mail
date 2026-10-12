import { useMemo, useState, type ReactNode } from 'react'
import type { CreateAccountInput, EndpointInput, IncomingProtocol, Security } from '@shared/mail'
import { useMail } from '../state/mail'
import { IconClose, IconRefresh } from './icons'

interface Preset {
  incoming: Omit<EndpointInput, 'username'>
  outgoing: Omit<EndpointInput, 'username'>
}

const PRESETS: Record<string, Preset> = {
  'gmail.com': {
    incoming: { host: 'imap.gmail.com', port: 993, security: 'ssl' },
    outgoing: { host: 'smtp.gmail.com', port: 465, security: 'ssl' }
  },
  'googlemail.com': {
    incoming: { host: 'imap.gmail.com', port: 993, security: 'ssl' },
    outgoing: { host: 'smtp.gmail.com', port: 465, security: 'ssl' }
  },
  'outlook.com': {
    incoming: { host: 'outlook.office365.com', port: 993, security: 'ssl' },
    outgoing: { host: 'smtp.office365.com', port: 587, security: 'starttls' }
  },
  'hotmail.com': {
    incoming: { host: 'outlook.office365.com', port: 993, security: 'ssl' },
    outgoing: { host: 'smtp.office365.com', port: 587, security: 'starttls' }
  },
  'live.com': {
    incoming: { host: 'outlook.office365.com', port: 993, security: 'ssl' },
    outgoing: { host: 'smtp.office365.com', port: 587, security: 'starttls' }
  },
  'yahoo.com': {
    incoming: { host: 'imap.mail.yahoo.com', port: 993, security: 'ssl' },
    outgoing: { host: 'smtp.mail.yahoo.com', port: 465, security: 'ssl' }
  },
  'icloud.com': {
    incoming: { host: 'imap.mail.me.com', port: 993, security: 'ssl' },
    outgoing: { host: 'smtp.mail.me.com', port: 587, security: 'starttls' }
  },
  'fastmail.com': {
    incoming: { host: 'imap.fastmail.com', port: 993, security: 'ssl' },
    outgoing: { host: 'smtp.fastmail.com', port: 465, security: 'ssl' }
  },
  'zoho.com': {
    incoming: { host: 'imap.zoho.com', port: 993, security: 'ssl' },
    outgoing: { host: 'smtp.zoho.com', port: 465, security: 'ssl' }
  }
}

const SECURITIES: Security[] = ['ssl', 'starttls', 'none']

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
    <label className="block">
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

export function AccountSetup({ onClose }: { onClose: () => void }): ReactNode {
  const createAccount = useMail((s) => s.createAccount)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [incoming, setIncoming] = useState<EndpointInput>({ host: '', port: 993, security: 'ssl', username: '' })
  const [outgoing, setOutgoing] = useState<EndpointInput>({ host: '', port: 465, security: 'ssl', username: '' })
  const [protocol, setProtocol] = useState<IncomingProtocol>('imap')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [isError, setIsError] = useState(false)
  const [oauthBusy, setOauthBusy] = useState(false)

  async function signInGoogle(): Promise<void> {
    setOauthBusy(true)
    setIsError(false)
    setMessage(null)
    try {
      await window.clover.mail.startGoogleOAuth()
      onClose()
    } catch (error) {
      setIsError(true)
      setMessage((error as Error).message)
    } finally {
      setOauthBusy(false)
    }
  }

  async function signInMicrosoft(): Promise<void> {
    setOauthBusy(true)
    setIsError(false)
    setMessage(null)
    try {
      await window.clover.mail.startMicrosoftOAuth()
      onClose()
    } catch (error) {
      setIsError(true)
      setMessage((error as Error).message)
    } finally {
      setOauthBusy(false)
    }
  }

  const preset = useMemo(() => {
    const domain = email.split('@')[1]?.toLowerCase().trim()
    return domain ? PRESETS[domain] : undefined
  }, [email])

  function applyEmail(value: string): void {
    setEmail(value)
    const domain = value.split('@')[1]?.toLowerCase().trim()
    const found = domain ? PRESETS[domain] : undefined
    if (found) {
      setIncoming({ ...found.incoming, username: value })
      setOutgoing({ ...found.outgoing, username: value })
    } else {
      setIncoming((prev) => ({ ...prev, username: value || prev.username }))
      setOutgoing((prev) => ({ ...prev, username: value || prev.username }))
    }
  }

  async function submit(): Promise<void> {
    setBusy(true)
    setMessage(null)
    setIsError(false)
    const input: CreateAccountInput = {
      email: email.trim(),
      displayName: displayName.trim() || undefined,
      password,
      protocol,
      incoming: { ...incoming, username: incoming.username || email.trim() },
      outgoing: { ...outgoing, username: outgoing.username || email.trim() }
    }
    try {
      const result = await window.clover.mail.testConnection(input)
      if (!result.ok) {
        setIsError(true)
        setMessage(result.error ?? 'Connection failed')
        return
      }
      await createAccount(input)
      onClose()
    } catch (error) {
      setIsError(true)
      setMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm">
      <div className="animate-fade-in w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
        <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Add account</h2>
            <p className="text-[11px] text-muted">
              {preset ? 'Settings auto-filled for this provider.' : 'Enter your mail server settings.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/10"
          >
            <IconClose />
          </button>
        </header>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void signInGoogle()}
              disabled={oauthBusy}
              className="rounded-lg border border-line bg-canvas/50 px-3 py-2.5 text-[12px] font-medium text-ink hover:border-accent disabled:opacity-50"
            >
              Sign in with Google
            </button>
            <button
              type="button"
              onClick={() => void signInMicrosoft()}
              disabled={oauthBusy}
              className="rounded-lg border border-line bg-canvas/50 px-3 py-2.5 text-[12px] font-medium text-ink hover:border-accent disabled:opacity-50"
            >
              Sign in with Microsoft
            </button>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted">
            <span className="h-px flex-1 bg-line" />
            or add manually
            <span className="h-px flex-1 bg-line" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Email address" value={email} onChange={applyEmail} placeholder="you@example.com" />
            <Field label="Display name" value={displayName} onChange={setDisplayName} placeholder="Optional" />
          </div>
          <Field label="Password / app password" value={password} onChange={setPassword} type="password" />

          <div className="rounded-xl border border-line bg-canvas/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Incoming
              </span>
              <select
                value={protocol}
                onChange={(e) => {
                  const next = e.target.value as IncomingProtocol
                  setProtocol(next)
                  setIncoming((prev) => ({ ...prev, port: next === 'pop3' ? 995 : 993 }))
                }}
                className="rounded-md border border-line bg-canvas/60 px-2 py-1 text-[11px] text-ink outline-none focus:border-accent"
              >
                <option value="imap">IMAP</option>
                <option value="pop3">POP3</option>
              </select>
            </div>
            <div className="grid grid-cols-[1fr_90px_120px] gap-2">
              <Field label="Server" value={incoming.host} onChange={(v) => setIncoming({ ...incoming, host: v })} />
              <Field
                label="Port"
                type="number"
                value={incoming.port}
                onChange={(v) => setIncoming({ ...incoming, port: Number(v) || 0 })}
              />
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-muted">Security</span>
                <select
                  value={incoming.security}
                  onChange={(e) => setIncoming({ ...incoming, security: e.target.value as Security })}
                  className="w-full rounded-lg border border-line bg-canvas/60 px-2 py-2 text-[13px] text-ink outline-none focus:border-accent"
                >
                  {SECURITIES.map((s) => (
                    <option key={s} value={s}>
                      {s.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-2">
              <Field label="Username" value={incoming.username} onChange={(v) => setIncoming({ ...incoming, username: v })} />
            </div>
          </div>

          <div className="rounded-xl border border-line bg-canvas/40 p-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Outgoing (SMTP)</div>
            <div className="grid grid-cols-[1fr_90px_120px] gap-2">
              <Field label="Server" value={outgoing.host} onChange={(v) => setOutgoing({ ...outgoing, host: v })} />
              <Field
                label="Port"
                type="number"
                value={outgoing.port}
                onChange={(v) => setOutgoing({ ...outgoing, port: Number(v) || 0 })}
              />
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-muted">Security</span>
                <select
                  value={outgoing.security}
                  onChange={(e) => setOutgoing({ ...outgoing, security: e.target.value as Security })}
                  className="w-full rounded-lg border border-line bg-canvas/60 px-2 py-2 text-[13px] text-ink outline-none focus:border-accent"
                >
                  {SECURITIES.map((s) => (
                    <option key={s} value={s}>
                      {s.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-2">
              <Field label="Username" value={outgoing.username} onChange={(v) => setOutgoing({ ...outgoing, username: v })} />
            </div>
          </div>

          {message && (
            <div
              className={
                'rounded-lg border px-3 py-2 text-[12px] ' +
                (isError
                  ? 'border-rose-500/30 bg-rose-500/10 text-rose-500'
                  : 'border-accent/30 bg-accent/10 text-accent')
              }
            >
              {message}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3.5 py-2 text-[13px] text-muted hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !email || !password || !incoming.host || !outgoing.host}
            onClick={submit}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink disabled:opacity-50"
          >
            {busy && <IconRefresh className="h-4 w-4 animate-spin" />}
            {busy ? 'Testing…' : 'Test & add'}
          </button>
        </footer>
      </div>
    </div>
  )
}
