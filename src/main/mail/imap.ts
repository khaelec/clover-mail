import { ImapFlow } from 'imapflow'
import type { EndpointInput } from '@shared/mail'

export interface ImapAuth {
  user: string
  pass?: string
  accessToken?: string
}

export function buildImapClient(settings: EndpointInput, auth: ImapAuth): ImapFlow {
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
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000
  })
  // imapflow emits 'error' on socket timeouts and dropped connections. With no
  // listener Node turns that into an uncaught exception and crashes the app
  // (the "JavaScript error occurred in the main process" dialog). The operation
  // that owns the client still surfaces the failure through its own promise; this
  // listener only stops the crash.
  client.on('error', () => undefined)
  return client
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
