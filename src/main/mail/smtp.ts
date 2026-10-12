import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import type { EndpointInput } from '@shared/mail'

export function buildTransport(settings: EndpointInput, password: string): Transporter {
  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.security === 'ssl',
    requireTLS: settings.security === 'starttls',
    ignoreTLS: settings.security === 'none',
    auth: { user: settings.username, pass: password },
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000
  })
}

export async function testSmtp(settings: EndpointInput, password: string): Promise<string> {
  const transport = buildTransport(settings, password)
  try {
    await transport.verify()
    return 'SMTP connection succeeded'
  } finally {
    transport.close()
  }
}
