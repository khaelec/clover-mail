import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import type { EndpointInput } from '@shared/mail'

export interface SmtpAuth {
  user: string
  pass?: string
  accessToken?: string
}

export function buildTransport(settings: EndpointInput, auth: SmtpAuth): Transporter {
  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.security === 'ssl',
    requireTLS: settings.security === 'starttls',
    ignoreTLS: settings.security === 'none',
    auth: auth.accessToken
      ? { type: 'OAuth2', user: auth.user, accessToken: auth.accessToken }
      : { user: auth.user, pass: auth.pass ?? '' },
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000
  })
}

export async function testSmtp(settings: EndpointInput, auth: SmtpAuth): Promise<string> {
  const transport = buildTransport(settings, auth)
  try {
    await transport.verify()
    return 'SMTP connection succeeded'
  } finally {
    transport.close()
  }
}
