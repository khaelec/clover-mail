import type { ParsedMail } from 'mailparser'
import { eq } from 'drizzle-orm'
import { getDb } from '@core/db'
import { messageBodies, messages } from '@core/db/schema'
import type { ListUnsubscribe, UnsubscribeResult } from '@shared/mail'
import { sendNow } from './outbox'

function headerLine(parsed: ParsedMail, key: string): string | null {
  const line = parsed.headerLines?.find((h) => h.key.toLowerCase() === key)?.line
  if (!line) return null
  // "List-Unsubscribe: <…>, <…>" (folded lines joined)
  return line.slice(line.indexOf(':') + 1).replace(/\r?\n[ \t]+/g, ' ').trim()
}

/**
 * The List-Unsubscribe header (RFC 2369) as stored JSON, with whether the
 * sender supports one-click unsubscribe (RFC 8058). Null when there's none.
 */
export function listUnsubscribeJson(parsed: ParsedMail): string | null {
  const value = headerLine(parsed, 'list-unsubscribe')
  if (!value) return null
  const targets = [...value.matchAll(/<([^>]+)>/g)].map((m) => m[1].trim())
  const http = targets.find((t) => /^https:\/\//i.test(t)) ?? targets.find((t) => /^http:\/\//i.test(t))
  const mailto = targets.find((t) => /^mailto:/i.test(t))
  if (!http && !mailto) return null
  const post = headerLine(parsed, 'list-unsubscribe-post') ?? ''
  const info: ListUnsubscribe = {
    ...(http ? { http } : {}),
    ...(mailto ? { mailto } : {}),
    oneClick: Boolean(http) && /List-Unsubscribe=One-Click/i.test(post)
  }
  return JSON.stringify(info)
}

export function parseListUnsubscribe(json: string | null | undefined): ListUnsubscribe | null {
  if (!json) return null
  try {
    const info = JSON.parse(json) as ListUnsubscribe
    return info.http || info.mailto ? info : null
  } catch {
    return null
  }
}

function mailtoParts(href: string): { to: string; subject: string; body: string } {
  const rest = href.replace(/^mailto:/i, '')
  const [path, query = ''] = rest.split('?', 2)
  const params = new URLSearchParams(query)
  return {
    to: decodeURIComponent(path),
    subject: params.get('subject') || 'unsubscribe',
    body: params.get('body') || 'unsubscribe'
  }
}

/**
 * Unsubscribe from the mailing list a message came from: a one-click POST when
 * the sender supports it, otherwise an unsubscribe email, otherwise the
 * sender's web page for the caller to open.
 */
export async function unsubscribe(messageId: string): Promise<UnsubscribeResult> {
  const db = getDb()
  const row = db.select().from(messages).where(eq(messages.id, messageId)).get()
  const body = db.select().from(messageBodies).where(eq(messageBodies.messageId, messageId)).get()
  const info = parseListUnsubscribe(body?.listUnsubscribe)
  if (!row || !info) throw new Error("This message doesn't say how to unsubscribe")

  if (info.oneClick && info.http) {
    try {
      const res = await fetch(info.http, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000)
      })
      if (res.ok) return { status: 'done' }
    } catch {
      // Fall back to the email or the web page below.
    }
  }
  if (info.mailto) {
    const { to, subject, body: text } = mailtoParts(info.mailto)
    await sendNow({ accountId: row.accountId, to: [to], subject, text })
    return { status: 'sent' }
  }
  return { status: 'open', url: info.http as string }
}
