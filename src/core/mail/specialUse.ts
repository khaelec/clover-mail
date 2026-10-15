export const SPECIAL_USE_ORDER: Record<string, number> = {
  inbox: 0,
  drafts: 1,
  sent: 2,
  archive: 3,
  junk: 4,
  trash: 5
}

const SENT_NAMES = ['sent', 'sent mail', 'sent items', 'sent messages', 'outbox']
const DRAFT_NAMES = ['draft', 'drafts']
const TRASH_NAMES = ['trash', 'deleted items', 'deleted messages', 'bin', 'deleted']
const JUNK_NAMES = ['junk', 'spam', 'junk mail', 'junk e-mail', 'bulk mail']
const ARCHIVE_NAMES = ['archive', 'all mail', 'all']

/**
 * Many servers don't advertise IMAP SPECIAL-USE flags, so a folder like
 * "[Gmail]/Sent Mail" or "Sent Items" can arrive untagged. Infer the role from
 * its last path segment or display name so sent mail still gets filed.
 */
export function inferSpecialUse(remotePath: string, name?: string | null): string | null {
  const last = (remotePath.split(/[\\/]/).pop() ?? remotePath).trim().toLowerCase()
  const label = (name ?? '').trim().toLowerCase()
  const candidates = [last, label]
  const has = (set: string[]): boolean => candidates.some((c) => set.includes(c))
  if (has(SENT_NAMES)) return 'sent'
  if (has(DRAFT_NAMES)) return 'drafts'
  if (has(TRASH_NAMES)) return 'trash'
  if (has(JUNK_NAMES)) return 'junk'
  if (has(ARCHIVE_NAMES)) return 'archive'
  return null
}
