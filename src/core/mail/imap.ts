import type { Socket } from 'node:net'
import { ImapFlow } from 'imapflow'
import type { EndpointInput } from '@shared/mail'
import { logLine } from '@core/log'

export interface ImapAuth {
  user: string
  pass?: string
  accessToken?: string
}

export interface ImapTimeouts {
  connectionTimeout?: number
  greetingTimeout?: number
  socketTimeout?: number
}

export function buildImapClient(
  settings: EndpointInput,
  auth: ImapAuth,
  timeouts: ImapTimeouts = {},
  /** Names the connection in the log (e.g. "idle you@gmail.com"); unset: not logged. */
  label?: string
): ImapFlow {
  const secure = settings.security === 'ssl'
  const client = new ImapFlow({
    host: settings.host,
    port: settings.port,
    secure,
    auth: auth.accessToken
      ? { user: auth.user, accessToken: auth.accessToken }
      : { user: auth.user, pass: auth.pass ?? '' },
    doSTARTTLS: settings.security === 'starttls',
    tls: { rejectUnauthorized: settings.security !== 'none' },
    logger: false,
    emitLogs: false,
    connectionTimeout: timeouts.connectionTimeout ?? 20_000,
    greetingTimeout: timeouts.greetingTimeout ?? 15_000,
    socketTimeout: timeouts.socketTimeout ?? 60_000
  })
  // imapflow emits 'error' on socket timeouts and dropped connections. With no
  // listener Node turns that into an uncaught exception and crashes the app
  // (the "JavaScript error occurred in the main process" dialog). The operation
  // that owns the client still surfaces the failure through its own promise; this
  // listener only stops the crash.
  client.on('error', () => undefined)
  if (label) watchConnection(client, label)
  return client
}

/**
 * Log why a connection ends when we didn't end it: the error imapflow reports
 * (with the server's BYE text, when it sent one), or the server simply closing
 * the socket, and how long the connection had been up. Recovery happens
 * elsewhere; this is so a drop can be explained afterwards.
 */
function watchConnection(client: ImapFlow, label: string): void {
  let leaving = false
  let reported = false
  let since = 0
  const uptime = (): string => {
    if (!since) return 'before connecting'
    const s = Math.round((Date.now() - since) / 1000)
    return s < 120 ? `after ${s}s` : `after ${Math.round(s / 60)} min`
  }
  // Only the first sign of a drop is logged; the rest are the same event.
  const report = (what: string): void => {
    if (leaving || reported) return
    reported = true
    logLine('imap', `${label}: ${what} ${uptime()}`)
  }
  const byeReason = (): string | undefined => (client as unknown as { byeReason?: string }).byeReason
  const logout = client.logout.bind(client)
  client.logout = async () => {
    leaving = true
    return logout()
  }
  const connect = client.connect.bind(client)
  client.connect = async () => {
    await connect()
    since = Date.now()
    // 'end' is the server closing its side; our own close() never emits it.
    const socket = (client as unknown as { socket?: Socket }).socket
    socket?.once('end', () => {
      const bye = byeReason()
      report(`server closed the connection${bye ? ` (${bye})` : ''}`)
    })
  }
  client.on('error', (err: Error & { code?: string; reason?: string }) => {
    const code = err.code ? `${err.code} ` : ''
    report(`${code}${err.message}${err.reason ? ` (${err.reason})` : ''}`)
  })
  // A server BYE: imapflow closes the connection itself, often before 'end'.
  client.on('close', () => {
    const bye = byeReason()
    if (bye) report(`server ended the session (${bye})`)
  })
}

export async function testImap(settings: EndpointInput, auth: ImapAuth): Promise<string> {
  const client = buildImapClient(settings, auth)
  await client.connect()
  try {
    await client.list()
    return 'IMAP connection succeeded'
  } finally {
    await client.logout().catch(() => undefined)
  }
}
