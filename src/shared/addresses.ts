/**
 * Recipient-field parsing shared by the compose window and the contacts engine.
 *
 * A field holds entries like `Ann Lee <ann@x.com>, "Smith, Bob" <bob@y.com>; c@z.com`.
 * Commas and semicolons separate entries except inside quotes or angle brackets;
 * a run of bare addresses separated only by spaces (a paste) is split too.
 */
export interface ParsedAddress {
  name: string | null
  email: string
}

const EMAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim())
}

/** Split a recipient field into its entries, keeping display names intact. */
export function splitAddresses(value: string): string[] {
  const parts: string[] = []
  let current = ''
  let quoted = false
  let angle = 0
  for (const ch of value) {
    if (ch === '"') quoted = !quoted
    else if (!quoted && ch === '<') angle += 1
    else if (!quoted && ch === '>') angle = Math.max(0, angle - 1)
    if (!quoted && angle === 0 && (ch === ',' || ch === ';')) {
      parts.push(current)
      current = ''
      continue
    }
    current += ch
  }
  parts.push(current)

  const out: string[] = []
  for (const raw of parts) {
    const part = raw.trim()
    if (!part) continue
    // "a@x.com b@y.com" -> two entries; "Ann Lee <ann@x.com>" stays one.
    const words = part.split(/\s+/)
    if (!part.includes('<') && !part.includes('"') && words.length > 1 && words.every(isValidEmail)) {
      out.push(...words)
    } else {
      out.push(part)
    }
  }
  return out
}

/** Parse one entry (`Name <email>`, `"Name" <email>`, `<email>` or `email`). */
export function parseAddress(entry: string): ParsedAddress | null {
  const value = entry.trim()
  if (!value) return null
  const angle = /^(.*)<\s*([^<>\s]+)\s*>\s*$/.exec(value)
  if (angle) {
    const email = angle[2].trim()
    const name = angle[1].trim().replace(/^"(.*)"$/, '$1').trim()
    return { name: name || null, email }
  }
  return { name: null, email: value.replace(/^mailto:/i, '') }
}

/** Format for a recipient field, quoting names that contain separators. */
export function formatAddress(name: string | null | undefined, email: string): string {
  const clean = (name ?? '').trim()
  if (!clean || clean.toLowerCase() === email.toLowerCase()) return email
  const safe = /[",;<>@()]/.test(clean) ? `"${clean.replace(/"/g, '')}"` : clean
  return `${safe} <${email}>`
}
