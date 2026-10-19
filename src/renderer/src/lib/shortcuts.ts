// Single source of truth for keyboard shortcuts: the key handler and the
// cheat-sheet modal both read from here, so they can never drift apart.

export type ShortcutId =
  | 'next'
  | 'prev'
  | 'search'
  | 'help'
  | 'compose'
  | 'reply'
  | 'replyAll'
  | 'forward'
  | 'archive'
  | 'delete'
  | 'star'
  | 'unread'
  | 'escape'
  | 'send'

export type ShortcutGroup = 'Navigation' | 'Actions' | 'Compose'

export interface Shortcut {
  id: ShortcutId
  display: string
  label: string
  group: ShortcutGroup
  matches: (e: KeyboardEvent) => boolean
}

const noMods = (e: KeyboardEvent): boolean => !e.ctrlKey && !e.metaKey && !e.altKey
const isKey = (e: KeyboardEvent, key: string): boolean =>
  noMods(e) && e.key.toLowerCase() === key

export const SHORTCUTS: Shortcut[] = [
  { id: 'next', display: 'j', label: 'Next message', group: 'Navigation', matches: (e) => isKey(e, 'j') },
  { id: 'prev', display: 'k', label: 'Previous message', group: 'Navigation', matches: (e) => isKey(e, 'k') },
  { id: 'search', display: '/', label: 'Search', group: 'Navigation', matches: (e) => isKey(e, '/') },
  { id: 'help', display: '?', label: 'Keyboard shortcuts', group: 'Navigation', matches: (e) => isKey(e, '?') },
  { id: 'compose', display: 'c', label: 'Compose', group: 'Compose', matches: (e) => isKey(e, 'c') },
  { id: 'reply', display: 'r', label: 'Reply', group: 'Actions', matches: (e) => isKey(e, 'r') && !e.shiftKey },
  { id: 'replyAll', display: 'Shift + R', label: 'Reply all', group: 'Actions', matches: (e) => isKey(e, 'r') && e.shiftKey },
  { id: 'forward', display: 'f', label: 'Forward', group: 'Actions', matches: (e) => isKey(e, 'f') },
  // `a` kept as an alias so the old binding still works.
  { id: 'archive', display: 'e', label: 'Archive', group: 'Actions', matches: (e) => isKey(e, 'e') || isKey(e, 'a') },
  { id: 'delete', display: '#', label: 'Delete to Trash', group: 'Actions', matches: (e) => isKey(e, '#') },
  { id: 'star', display: 's', label: 'Star / unstar', group: 'Actions', matches: (e) => isKey(e, 's') },
  { id: 'unread', display: 'u', label: 'Mark unread', group: 'Actions', matches: (e) => isKey(e, 'u') },
  { id: 'escape', display: 'Esc', label: 'Close reader or compose', group: 'Actions', matches: (e) => e.key === 'Escape' },
  // Listed for the cheat sheet; the composer handles it (it's typed in the editor).
  { id: 'send', display: 'Ctrl + Enter', label: 'Send', group: 'Compose', matches: () => false }
]

/** Resolve a key event to a shortcut id, or null if it isn't one. */
export function resolveShortcut(e: KeyboardEvent): ShortcutId | null {
  return SHORTCUTS.find((s) => s.matches(e))?.id ?? null
}
