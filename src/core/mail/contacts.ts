import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { getDb, getRawDb } from '@core/db'
import { contacts } from '@core/db/schema'
import { getSetting, setSetting } from '@core/settings'
import { platform } from '@core/platform'
import { formatAddress, isValidEmail, parseAddress, splitAddresses } from '@shared/addresses'
import type {
  Contact,
  ContactGroup,
  ContactImportResult,
  ContactInput,
  ContactSuggestion
} from '@shared/contacts'

/**
 * Address book + recipient autocomplete.
 *
 * Besides contacts the user saves, addresses are learned from mail: people you
 * send to (weighted most, like Outlook's nickname cache) and people who write to
 * you. Learning is incremental — a cursor over the messages table's rowid — so it
 * runs cheaply right before a lookup instead of slowing every sync.
 */

const CURSOR_KEY = 'contacts.harvestCursor'
const BATCH = 5000

// Automated senders nobody wants suggested as a recipient.
const NO_REPLY =
  /^(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|bounce[s]?|notifications?|alerts?|news(letter)?|info|support|billing|marketing|updates?)([+._-].*)?@/i

type Row = typeof contacts.$inferSelect

function toContact(row: Row): Contact {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    company: row.company,
    phone: row.phone,
    notes: row.notes,
    isSaved: row.isSaved,
    sendCount: row.sendCount,
    recvCount: row.recvCount,
    lastUsed: row.lastUsed
  }
}

function cleanName(name: string | null | undefined, email: string): string | null {
  const value = (name ?? '').replace(/^["']+|["']+$/g, '').replace(/\s+/g, ' ').trim()
  if (!value || value.includes('@') || value.toLowerCase() === email) return null
  return value
}

function cleanText(value: string | null | undefined): string | null {
  const v = (value ?? '').trim()
  return v ? v : null
}

function ownAddresses(): Set<string> {
  const raw = getRawDb()
  const rows = raw
    .prepare(
      `SELECT lower(email) AS e FROM accounts
       UNION SELECT lower(email) FROM account_aliases
       UNION SELECT lower(username) FROM incoming_settings`
    )
    .all() as { e: string | null }[]
  return new Set(rows.map((r) => r.e ?? '').filter(Boolean))
}

function parseJsonAddresses(json: string | null): { name: string | null; address: string }[] {
  if (!json) return []
  try {
    const list = JSON.parse(json) as { name: string | null; address: string | null }[]
    return list
      .filter((a) => a.address)
      .map((a) => ({ name: a.name, address: (a.address as string).toLowerCase() }))
  } catch {
    return []
  }
}

interface Learned {
  name: string | null
  send: number
  recv: number
  last: number
}

function upsertLearned(learned: Map<string, Learned>, now: number): void {
  if (learned.size === 0) return
  const stmt = getRawDb().prepare(
    `INSERT INTO contacts (id, email, name, send_count, recv_count, last_used, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET
       name = COALESCE(contacts.name, excluded.name),
       send_count = contacts.send_count + excluded.send_count,
       recv_count = contacts.recv_count + excluded.recv_count,
       last_used = MAX(COALESCE(contacts.last_used, 0), COALESCE(excluded.last_used, 0)),
       updated_at = excluded.updated_at`
  )
  for (const [email, l] of learned) {
    stmt.run(randomUUID(), email, l.name, l.send, l.recv, l.last || null, now, now)
  }
}

/** Learn addresses from messages stored since the last run. Never throws. */
export function harvestContacts(): void {
  try {
    const raw = getRawDb()
    const own = ownAddresses()
    let cursor = Number(getSetting<number>(CURSOR_KEY) ?? 0)
    const select = raw.prepare(
      `SELECT m.rowid AS rid, m.uid, m.from_name, m.from_email, m.to_json, m.cc_json, m.bcc_json,
              m.date_utc, m.is_spam, f.special_use
       FROM messages m JOIN folders f ON f.id = m.folder_id
       WHERE m.rowid > ? ORDER BY m.rowid LIMIT ?`
    )
    for (;;) {
      const rows = select.all(cursor, BATCH) as {
        rid: number
        uid: number
        from_name: string | null
        from_email: string | null
        to_json: string | null
        cc_json: string | null
        bcc_json: string | null
        date_utc: number | null
        is_spam: number
        special_use: string | null
      }[]
      if (rows.length === 0) break

      const learned = new Map<string, Learned>()
      const learn = (address: string, name: string | null, kind: 'send' | 'recv', at: number): void => {
        const email = address.trim().toLowerCase()
        if (!isValidEmail(email) || own.has(email)) return
        if (kind === 'recv' && NO_REPLY.test(email)) return
        const entry = learned.get(email) ?? { name: null, send: 0, recv: 0, last: 0 }
        entry.name = entry.name ?? cleanName(name, email)
        entry[kind] += 1
        entry.last = Math.max(entry.last, at)
        learned.set(email, entry)
      }

      for (const row of rows) {
        cursor = row.rid
        // Placeholder sent copies (negative UIDs) are replaced by the server copy,
        // which is learned then; All Mail/Trash/Junk would only double-count or
        // learn spammers.
        if (row.uid < 0 || row.is_spam) continue
        const use = row.special_use
        if (use === 'trash' || use === 'junk' || use === 'all' || use === 'drafts') continue
        const at = row.date_utc ?? 0
        const from = (row.from_email ?? '').toLowerCase()
        const outgoing = use === 'sent' || (from !== '' && own.has(from))
        if (outgoing) {
          for (const a of [
            ...parseJsonAddresses(row.to_json),
            ...parseJsonAddresses(row.cc_json),
            ...parseJsonAddresses(row.bcc_json)
          ]) {
            learn(a.address, a.name, 'send', at)
          }
        } else if (from) {
          learn(from, row.from_name, 'recv', at)
        }
      }

      raw.transaction(() => upsertLearned(learned, Date.now()))()
      setSetting(CURSOR_KEY, cursor)
      if (rows.length < BATCH) break
    }
  } catch {
    // Learning is best-effort; autocomplete still works from saved contacts.
  }
}

/** Remember recipients of a message just sent, so they're suggested right away. */
export function recordRecipients(entries: string[]): void {
  try {
    const own = ownAddresses()
    const now = Date.now()
    const stmt = getRawDb().prepare(
      `INSERT INTO contacts (id, email, name, last_used, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         name = COALESCE(contacts.name, excluded.name),
         is_hidden = 0,
         last_used = excluded.last_used,
         updated_at = excluded.updated_at`
    )
    for (const entry of entries.flatMap(splitAddresses)) {
      const parsed = parseAddress(entry)
      if (!parsed) continue
      const email = parsed.email.toLowerCase()
      if (!isValidEmail(email) || own.has(email)) continue
      stmt.run(randomUUID(), email, cleanName(parsed.name, email), now, now, now)
    }
  } catch {
    // best effort
  }
}

function likeEscape(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

export function suggestContacts(query: string, limit = 8): ContactSuggestion[] {
  const q = query.trim().replace(/^["'<]+/, '').toLowerCase()
  if (!q) return []
  harvestContacts()
  const p = likeEscape(q)
  const recent = Date.now() - 30 * 24 * 60 * 60_000
  const rows = getRawDb()
    .prepare(
      `SELECT email, name, is_saved FROM contacts
       WHERE is_hidden = 0
         AND (is_saved = 1 OR send_count > 0 OR recv_count > 0 OR last_used IS NOT NULL)
         AND (email LIKE ? ESCAPE '\\' OR lower(name) LIKE ? ESCAPE '\\'
              OR lower(name) LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\'
              OR lower(company) LIKE ? ESCAPE '\\')
       ORDER BY is_saved DESC,
         (send_count * 4 + MIN(recv_count, 25) + CASE WHEN last_used > ? THEN 10 ELSE 0 END) DESC,
         last_used DESC
       LIMIT ?`
    )
    .all(`${p}%`, `${p}%`, `% ${p}%`, `%@${p}%`, `${p}%`, recent, Math.max(1, Math.min(limit, 25))) as {
    email: string
    name: string | null
    is_saved: number
  }[]
  const people = rows.map((r) => ({ email: r.email, name: r.name, isSaved: r.is_saved === 1 }))
  // Groups whose name matches come first: picking one adds all its members.
  const groups = listGroups()
    .filter((g) => g.members.length > 0)
    .filter((g) => {
      const name = g.name.toLowerCase()
      return name.startsWith(q) || name.includes(` ${q}`)
    })
    .map((g) => ({
      email: `group:${g.id}`,
      name: g.name,
      isSaved: true,
      group: { id: g.id, members: g.members.map((m) => formatAddress(m.name, m.email)) }
    }))
  return [...groups, ...people].slice(0, Math.max(1, Math.min(limit, 25)))
}

// ---- Groups ----------------------------------------------------------------

export function listGroups(): ContactGroup[] {
  const raw = getRawDb()
  const groups = raw
    .prepare('SELECT id, name FROM contact_groups ORDER BY lower(name)')
    .all() as { id: string; name: string }[]
  const members = raw
    .prepare(
      `SELECT m.group_id, c.id, c.email, c.name, c.company, c.phone, c.notes, c.is_saved,
              c.send_count, c.recv_count, c.last_used
       FROM contact_group_members m JOIN contacts c ON c.id = m.contact_id
       WHERE c.is_hidden = 0
       ORDER BY lower(COALESCE(c.name, c.email))`
    )
    .all() as {
    group_id: string
    id: string
    email: string
    name: string | null
    company: string | null
    phone: string | null
    notes: string | null
    is_saved: number
    send_count: number
    recv_count: number
    last_used: number | null
  }[]
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    members: members
      .filter((m) => m.group_id === g.id)
      .map((m) => ({
        id: m.id,
        email: m.email,
        name: m.name,
        company: m.company,
        phone: m.phone,
        notes: m.notes,
        isSaved: m.is_saved === 1,
        sendCount: m.send_count,
        recvCount: m.recv_count,
        lastUsed: m.last_used
      }))
  }))
}

export function saveGroup(name: string, memberIds: string[], id?: string): ContactGroup {
  const clean = name.replace(/\s+/g, ' ').trim()
  if (!clean) throw new Error('Give the group a name.')
  const raw = getRawDb()
  const now = Date.now()
  const groupId = id ?? randomUUID()
  const clash = raw
    .prepare('SELECT id FROM contact_groups WHERE lower(name) = lower(?) AND id != ?')
    .get(clean, groupId)
  if (clash) throw new Error(`There's already a group called ${clean}.`)
  raw.transaction(() => {
    if (id) {
      const updated = raw.prepare('UPDATE contact_groups SET name = ?, updated_at = ? WHERE id = ?').run(clean, now, id)
      if (updated.changes === 0) throw new Error('Group not found.')
      raw.prepare('DELETE FROM contact_group_members WHERE group_id = ?').run(id)
    } else {
      raw
        .prepare('INSERT INTO contact_groups (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
        .run(groupId, clean, now, now)
    }
    const add = raw.prepare(
      `INSERT OR IGNORE INTO contact_group_members (group_id, contact_id)
       SELECT ?, id FROM contacts WHERE id = ?`
    )
    for (const memberId of new Set(memberIds)) add.run(groupId, memberId)
  })()
  return listGroups().find((g) => g.id === groupId) as ContactGroup
}

export function removeGroup(id: string): void {
  getRawDb().prepare('DELETE FROM contact_groups WHERE id = ?').run(id)
}

export function listContacts(scope: 'saved' | 'all', query = ''): Contact[] {
  harvestContacts()
  const q = query.trim().toLowerCase()
  const p = `%${likeEscape(q)}%`
  const rows = getRawDb()
    .prepare(
      `SELECT id, email, name, company, phone, notes, is_saved, send_count, recv_count, last_used
       FROM contacts
       WHERE is_hidden = 0
         AND (is_saved = 1 OR (? = 'all' AND (send_count > 0 OR recv_count > 0 OR last_used IS NOT NULL)))
         AND (? = '' OR email LIKE ? ESCAPE '\\' OR lower(name) LIKE ? ESCAPE '\\'
              OR lower(company) LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\')
       ORDER BY lower(COALESCE(name, email))
       LIMIT 5000`
    )
    .all(scope, q, p, p, p, p) as {
    id: string
    email: string
    name: string | null
    company: string | null
    phone: string | null
    notes: string | null
    is_saved: number
    send_count: number
    recv_count: number
    last_used: number | null
  }[]
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    company: r.company,
    phone: r.phone,
    notes: r.notes,
    isSaved: r.is_saved === 1,
    sendCount: r.send_count,
    recvCount: r.recv_count,
    lastUsed: r.last_used
  }))
}

export function saveContact(input: ContactInput, id?: string): Contact {
  const email = input.email.trim().toLowerCase()
  if (!isValidEmail(email)) throw new Error('Enter a valid email address.')
  const db = getDb()
  const now = Date.now()
  const fields = {
    email,
    name: cleanName(input.name, email),
    company: cleanText(input.company),
    phone: cleanText(input.phone),
    notes: cleanText(input.notes),
    isSaved: true,
    isHidden: false,
    updatedAt: now
  }
  const sameEmail = db.select().from(contacts).where(eq(contacts.email, email)).get()

  if (id) {
    const current = db.select().from(contacts).where(eq(contacts.id, id)).get()
    if (!current) throw new Error('Contact not found.')
    if (sameEmail && sameEmail.id !== id) {
      if (sameEmail.isSaved && !sameEmail.isHidden) {
        throw new Error(`${email} is already in your contacts.`)
      }
      // Changing the address to one only learned from mail: keep its history.
      db.delete(contacts).where(eq(contacts.id, sameEmail.id)).run()
      db.update(contacts)
        .set({
          ...fields,
          sendCount: current.sendCount + sameEmail.sendCount,
          recvCount: current.recvCount + sameEmail.recvCount
        })
        .where(eq(contacts.id, id))
        .run()
    } else {
      db.update(contacts).set(fields).where(eq(contacts.id, id)).run()
    }
    return toContact(db.select().from(contacts).where(eq(contacts.id, id)).get() as Row)
  }

  if (sameEmail) {
    db.update(contacts).set(fields).where(eq(contacts.id, sameEmail.id)).run()
    return toContact(db.select().from(contacts).where(eq(contacts.id, sameEmail.id)).get() as Row)
  }
  const newId = randomUUID()
  db.insert(contacts)
    .values({ id: newId, ...fields, createdAt: now })
    .run()
  return toContact(db.select().from(contacts).where(eq(contacts.id, newId)).get() as Row)
}

/**
 * Remove a contact from the address book and from autocomplete. The row stays
 * (hidden) so mail already received doesn't teach the address back.
 */
export function removeContact(id: string): void {
  getDb()
    .update(contacts)
    .set({ isSaved: false, isHidden: true, updatedAt: Date.now() })
    .where(eq(contacts.id, id))
    .run()
}

// ---- Import / export -------------------------------------------------------

function unfoldVcard(text: string): string[] {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n')
}

function vcardValue(line: string): string {
  const idx = line.indexOf(':')
  return idx < 0
    ? ''
    : line
        .slice(idx + 1)
        .replace(/\\n/gi, '\n')
        .replace(/\\([,;\\])/g, '$1')
        .trim()
}

export function parseVcards(text: string): ContactInput[] {
  const out: ContactInput[] = []
  let card: { name?: string; n?: string; emails: string[]; company?: string; phone?: string; notes?: string } | null =
    null
  for (const line of unfoldVcard(text)) {
    const key = line.split(/[;:]/, 1)[0].toUpperCase().replace(/^ITEM\d+\./, '')
    if (key === 'BEGIN' && /VCARD/i.test(line)) card = { emails: [] }
    else if (!card) continue
    else if (key === 'END') {
      const name = card.name || card.n
      for (const email of card.emails) {
        out.push({ email, name, company: card.company, phone: card.phone, notes: card.notes })
      }
      card = null
    } else if (key === 'FN') card.name = vcardValue(line)
    else if (key === 'N') {
      const [last = '', first = ''] = vcardValue(line).split(';')
      card.n = `${first} ${last}`.trim()
    } else if (key === 'EMAIL') card.emails.push(vcardValue(line))
    else if (key === 'ORG') card.company = vcardValue(line).split(';')[0]
    else if (key === 'TEL' && !card.phone) card.phone = vcardValue(line)
    else if (key === 'NOTE') card.notes = vcardValue(line)
  }
  return out
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const src = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"'
        i += 1
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim()))
}

/** Outlook, Gmail and generic CSV exports: find the columns by header name. */
export function parseContactsCsv(text: string): ContactInput[] {
  const [header, ...rows] = parseCsvRows(text)
  if (!header) return []
  const h = header.map((c) => c.trim().toLowerCase())
  const find = (re: RegExp): number => h.findIndex((c) => re.test(c))
  const emailCols = h
    .map((c, i) => (/e-?mail/.test(c) && !/type|display/.test(c) ? i : -1))
    .filter((i) => i >= 0)
  const nameCol = find(/^(name|display name|full name)$/)
  const firstCol = find(/^(first name|given name)$/)
  const lastCol = find(/^(last name|family name|surname)$/)
  const companyCol = find(/company|organi[sz]ation( 1 - name)?$/)
  const phoneCol = find(/phone|mobile/)
  const notesCol = find(/^notes?$/)
  const out: ContactInput[] = []
  for (const r of rows) {
    const cell = (i: number): string => (i >= 0 ? (r[i] ?? '').trim() : '')
    const name = cell(nameCol) || `${cell(firstCol)} ${cell(lastCol)}`.trim()
    const emails = emailCols
      .flatMap((i) => cell(i).split(/\s*:::\s*|\s*;\s*/))
      .filter((e) => isValidEmail(e))
    for (const email of new Set(emails)) {
      out.push({ email, name, company: cell(companyCol), phone: cell(phoneCol), notes: cell(notesCol) })
    }
  }
  return out
}

export function importContacts(entries: ContactInput[]): ContactImportResult {
  const result: ContactImportResult = { imported: 0, updated: 0, skipped: 0 }
  const db = getDb()
  for (const entry of entries) {
    const email = (entry.email ?? '').trim().toLowerCase()
    if (!isValidEmail(email)) {
      result.skipped += 1
      continue
    }
    const existing = db.select().from(contacts).where(eq(contacts.email, email)).get()
    // Don't blank out details the user already has with empty imported fields.
    saveContact(
      {
        email,
        name: entry.name || existing?.name,
        company: entry.company || existing?.company,
        phone: entry.phone || existing?.phone,
        notes: entry.notes || existing?.notes
      },
      existing?.id
    )
    if (existing?.isSaved && !existing.isHidden) result.updated += 1
    else result.imported += 1
  }
  return result
}

export async function pickAndImportContacts(): Promise<ContactImportResult | null> {
  const picked = await platform().showOpenDialog({
    title: 'Import contacts',
    filters: [
      { name: 'Contacts', extensions: ['vcf', 'vcard', 'csv'] },
      { name: 'All files', extensions: ['*'] }
    ]
  })
  if (picked.canceled || picked.filePaths.length === 0) return null
  const entries: ContactInput[] = []
  for (const path of picked.filePaths) {
    const text = readFileSync(path, 'utf8')
    entries.push(...(/BEGIN:VCARD/i.test(text) ? parseVcards(text) : parseContactsCsv(text)))
  }
  return importContacts(entries)
}

function vcardEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1')
}

export function toVcards(list: Contact[]): string {
  return list
    .map((c) => {
      const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${vcardEscape(c.name ?? c.email)}`]
      if (c.name) {
        const parts = c.name.split(' ')
        const last = parts.length > 1 ? (parts.pop() as string) : ''
        lines.push(`N:${vcardEscape(last)};${vcardEscape(parts.join(' '))};;;`)
      } else lines.push('N:;;;;')
      lines.push(`EMAIL;TYPE=INTERNET:${c.email}`)
      if (c.company) lines.push(`ORG:${vcardEscape(c.company)}`)
      if (c.phone) lines.push(`TEL:${vcardEscape(c.phone)}`)
      if (c.notes) lines.push(`NOTE:${vcardEscape(c.notes)}`)
      lines.push('END:VCARD')
      return lines.join('\r\n')
    })
    .join('\r\n')
}

export async function exportContacts(): Promise<{ path: string; count: number } | null> {
  const list = listContacts('saved')
  const result = await platform().showSaveDialog('Clover Contacts.vcf')
  if (result.canceled || !result.filePath) return null
  writeFileSync(result.filePath, `${toVcards(list)}\r\n`, 'utf8')
  return { path: result.filePath, count: list.length }
}
