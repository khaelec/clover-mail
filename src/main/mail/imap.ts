import { ImapFlow } from 'imapflow'
import type { EndpointInput } from '@shared/mail'

export interface ImapConnectOptions {
  keepalive?: boolean
}

export function buildImapClient(
  settings: EndpointInput,
  password: string
): ImapFlow {
  const secure = settings.security === 'ssl'
  return new ImapFlow({
    host: settings.host,
    port: settings.port,
    secure,
    auth: { user: settings.username, pass: password },
    doSTARTTLS: settings.security === 'starttls',
    tls: { rejectUnauthorized: settings.security !== 'none' },
    logger: false,
    emitLogs: false,
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000
  })
}

export async function testImap(
  settings: EndpointInput,
  password: string
): Promise<string> {
  const client = buildImapClient(settings, password)
  await client.connect()
  try {
    await client.list()
    return 'IMAP connection succeeded'
  } finally {
    await client.logout().catch(() => undefined)
  }
}
