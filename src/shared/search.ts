// Search operators (from:, to:, subject:, has:, is:, in:, label:, before:,
// after:) shared by the search engine and the search filters form.

export interface ParsedSearch {
  text: string
  from?: string
  to?: string
  subject?: string
  hasAttachment?: boolean
  isUnread?: boolean
  isRead?: boolean
  isFlagged?: boolean
  isImportant?: boolean
  inFolder?: string
  label?: string
  before?: number
  after?: number
}

/** A date in local time: "2026-10-16" means that day here, not midnight UTC. */
function parseDate(value: string): number | undefined {
  const ymd = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value)
  if (ymd) return new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])).getTime()
  const t = Date.parse(value)
  return Number.isNaN(t) ? undefined : t
}

/** Parse Gmail-style operators (from:, to:, subject:, has:attachment, is:unread, in:, label:, before:, after:) plus free text. */
export function parseSearch(input: string): ParsedSearch {
  const result: ParsedSearch = { text: '' }
  const tokens: string[] = []
  const re = /(\w+):("([^"]*)"|\S+)|"([^"]*)"|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(input)) !== null) {
    const key = m[1]?.toLowerCase()
    const val = (m[3] ?? m[2] ?? m[4] ?? m[5] ?? '').replace(/^"|"$/g, '')
    if (m[1] && val !== '') {
      switch (key) {
        case 'from':
          result.from = val
          break
        case 'to':
          result.to = val
          break
        case 'subject':
          result.subject = val
          break
        case 'body':
        case 'text':
          tokens.push(val)
          break
        case 'has':
          if (val === 'attachment' || val === 'attachments') result.hasAttachment = true
          break
        case 'is':
          if (val === 'unread') result.isUnread = true
          else if (val === 'read') result.isRead = true
          else if (val === 'flagged' || val === 'starred') result.isFlagged = true
          else if (val === 'important') result.isImportant = true
          break
        case 'in':
          result.inFolder = val
          break
        case 'label':
          result.label = val
          break
        case 'before':
          result.before = parseDate(val)
          break
        case 'after':
          result.after = parseDate(val)
          break
        default:
          tokens.push(m[0])
      }
    } else {
      const word = m[4] ?? m[5]
      if (word) tokens.push(word)
    }
  }
  result.text = tokens.join(' ')
  return result
}

/** The search filters form, as plain fields. Dates are "YYYY-MM-DD"; both ends are inclusive. */
export interface SearchFields {
  keywords: string
  from: string
  to: string
  subject: string
  folder: string
  fromDate: string
  toDate: string
  hasAttachment: boolean
  unread: boolean
  flagged: boolean
}

function ymd(time: number): string {
  const d = new Date(time)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Read a search back into the form (operators it doesn't show stay in Keywords). */
export function searchToFields(query: string): SearchFields {
  const parsed = parseSearch(query)
  const extra: string[] = []
  if (parsed.label) extra.push(`label:${quoteValue(parsed.label)}`)
  if (parsed.isRead) extra.push('is:read')
  if (parsed.isImportant) extra.push('is:important')
  return {
    keywords: [parsed.text, ...extra].filter(Boolean).join(' '),
    from: parsed.from ?? '',
    to: parsed.to ?? '',
    subject: parsed.subject ?? '',
    folder: parsed.inFolder ?? '',
    fromDate: parsed.after ? ymd(parsed.after) : '',
    // before: is exclusive; the form's "To" date is the last day included.
    toDate: parsed.before ? ymd(parsed.before - 86_400_000) : '',
    hasAttachment: Boolean(parsed.hasAttachment),
    unread: Boolean(parsed.isUnread),
    flagged: Boolean(parsed.isFlagged)
  }
}

function quoteValue(value: string): string {
  const clean = value.replace(/"/g, '').trim()
  return /\s/.test(clean) ? `"${clean}"` : clean
}

/** Turn the form into a search string with operators. */
export function fieldsToSearch(fields: SearchFields): string {
  const parts: string[] = []
  if (fields.from.trim()) parts.push(`from:${quoteValue(fields.from)}`)
  if (fields.to.trim()) parts.push(`to:${quoteValue(fields.to)}`)
  if (fields.subject.trim()) parts.push(`subject:${quoteValue(fields.subject)}`)
  if (fields.folder.trim()) parts.push(`in:${quoteValue(fields.folder)}`)
  if (fields.fromDate) parts.push(`after:${fields.fromDate}`)
  if (fields.toDate) {
    const [y, m, d] = fields.toDate.split('-').map(Number)
    parts.push(`before:${ymd(new Date(y, m - 1, d + 1).getTime())}`)
  }
  if (fields.hasAttachment) parts.push('has:attachment')
  if (fields.unread) parts.push('is:unread')
  if (fields.flagged) parts.push('is:flagged')
  if (fields.keywords.trim()) parts.push(fields.keywords.trim())
  return parts.join(' ')
}
