import { SETTINGS_KEYS } from '@shared/theme'
import { getSetting } from '../settings'
import type { MessagePhishing, MessageSecurity } from '@shared/mail'

const PUNYCODE = /xn--/i
const SUSPICIOUS_TLDS = [
  '.zip',
  '.mov',
  '.top',
  '.xyz',
  '.click',
  '.link',
  '.work',
  '.review',
  '.country',
  '.gq',
  '.tk',
  '.ml',
  '.cf',
  '.kim',
  '.cricket',
  '.science',
  '.party'
]
const URL_RE = /https?:\/\/[^\s"'<>)]+/gi
const NON_ASCII = /[^\u0000-\u007f]/

export function trustedSenders(): string[] {
  const raw = getSetting<string[]>(SETTINGS_KEYS.trustedSenders)
  return Array.isArray(raw) ? raw.map((s) => s.toLowerCase()) : []
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

function domainOf(email: string | null | undefined): string | null {
  if (!email) return null
  const at = email.lastIndexOf('@')
  if (at < 0) return null
  return email.slice(at + 1).toLowerCase()
}

function hostMatches(a: string, b: string): boolean {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`)
}

/** Heuristic phishing / spoofing detection shown as a warning banner. */
export function assessPhishing(
  fromEmail: string | null,
  fromName: string | null,
  replyToJson: string | null,
  htmlRaw: string | null,
  textPlain: string | null,
  trusted: string[]
): MessagePhishing {
  if (fromEmail && trusted.includes(fromEmail.toLowerCase())) {
    return { suspicious: false, reasons: [] }
  }
  const reasons: string[] = []
  const fromDomain = domainOf(fromEmail)
  const html = htmlRaw ?? ''

  // Display name that claims a different address/domain than the real sender.
  if (fromName && fromDomain) {
    const nameEmails = fromName.match(/[\w.+-]+@[\w.-]+/g) ?? []
    for (const candidate of nameEmails) {
      const d = domainOf(candidate)
      if (d && d !== fromDomain) {
        reasons.push(`Display name claims "${candidate}" but the message is from @${fromDomain}`)
      }
    }
    if (nameEmails.length === 0) {
      const nameDomains = fromName.match(/\b([a-z0-9-]+\.)+[a-z]{2,}\b/gi) ?? []
      for (const d of nameDomains) {
        const clean = d.toLowerCase().replace(/^www\./, '')
        if (fromDomain && !hostMatches(fromDomain, clean)) {
          reasons.push(`Display name mentions "${d}" but the message is from @${fromDomain}`)
        }
      }
    }
  }

  // Reply-To that leaves the sender's domain.
  if (replyToJson) {
    try {
      const list = JSON.parse(replyToJson) as { address: string | null }[]
      for (const entry of list) {
        const d = domainOf(entry.address)
        if (d && fromDomain && d !== fromDomain) {
          reasons.push(`Replies go to @${d}, not the sender's @${fromDomain}`)
        }
      }
    } catch {
      // ignore malformed Reply-To
    }
  }

  // Anchor text vs. actual href mismatch, and punycode link hosts.
  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null
  let linkWarnings = 0
  while ((match = anchorRe.exec(html)) !== null && linkWarnings < 3) {
    const href = match[1]
    const text = match[2].replace(/<[^>]+>/g, ' ').trim()
    const hrefHost = hostOf(href)
    if (!hrefHost) continue
    const textUrl = text.match(/https?:\/\/[^\s]+|(?:[a-z0-9-]+\.)+[a-z]{2,}/i)
    if (textUrl) {
      const textHost = textUrl[0].includes('://')
        ? hostOf(textUrl[0])
        : textUrl[0].replace(/^www\./, '').toLowerCase()
      if (textHost && !hostMatches(hrefHost, textHost)) {
        reasons.push(`A link labelled "${textUrl[0]}" actually points to ${hrefHost}`)
        linkWarnings++
      }
    }
    if (PUNYCODE.test(hrefHost)) {
      reasons.push(`A link uses a look-alike (punycode) domain: ${hrefHost}`)
      linkWarnings++
    }
  }

  const allUrls = `${html} ${textPlain ?? ''}`.match(URL_RE) ?? []
  for (const url of allUrls) {
    const h = hostOf(url)
    if (h && PUNYCODE.test(h)) {
      reasons.push(`Link to a look-alike (punycode) domain: ${h}`)
      break
    }
  }
  for (const url of allUrls) {
    const h = hostOf(url)
    if (h && SUSPICIOUS_TLDS.some((tld) => h.endsWith(tld))) {
      reasons.push(`Link to a high-risk domain: ${h}`)
      break
    }
  }

  if (fromName && NON_ASCII.test(fromName)) {
    reasons.push('Sender name mixes in unusual non-Latin characters')
  }

  const unique = [...new Set(reasons)].slice(0, 4)
  return { suspicious: unique.length > 0, reasons: unique }
}

/** Classify a message as PGP/S-MIME signed and/or encrypted using its MIME parts. */
export function classifySecurity(
  htmlRaw: string | null,
  textPlain: string | null,
  attachmentMimeTypes: string[]
): MessageSecurity {
  const text = `${htmlRaw ?? ''}\n${textPlain ?? ''}`
  const mimes = attachmentMimeTypes.map((m) => (m ?? '').toLowerCase())

  let signing: MessageSecurity['signing'] = 'none'
  let encryption: MessageSecurity['encryption'] = 'none'

  if (mimes.includes('application/pgp-signature')) signing = 'pgp-mime'
  else if (
    mimes.includes('application/pkcs7-signature') ||
    mimes.includes('application/x-pkcs7-signature')
  ) {
    signing = 'smime'
  }

  if (mimes.includes('application/pgp-encrypted')) encryption = 'pgp-mime'
  else if (
    mimes.includes('application/pkcs7-mime') ||
    mimes.includes('application/x-pkcs7-mime')
  ) {
    encryption = 'smime'
  }

  if (signing === 'none' && /-----BEGIN PGP SIGNED MESSAGE-----/.test(text)) {
    signing = 'pgp-inline'
  }
  if (encryption === 'none' && /-----BEGIN PGP MESSAGE-----/.test(text)) {
    encryption = 'pgp-inline'
  }

  return {
    signing,
    encryption,
    signed: signing !== 'none',
    encrypted: encryption !== 'none',
    verified: false
  }
}
