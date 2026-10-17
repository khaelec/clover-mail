import { create } from 'zustand'

/** Fields to start a new message with (from the address book, a mailto: link, …). */
export interface ComposeRequest {
  to?: string
  cc?: string
  subject?: string
  body?: string
}

interface ComposeRequestState {
  request: ComposeRequest | null
  clear: () => void
}

/**
 * The compose window lives in the Mail view. Other places put a request here and
 * switch to Mail; the Mail view opens it once mounted.
 */
export const useComposeRequest = create<ComposeRequestState>((set) => ({
  request: null,
  clear: () => set({ request: null })
}))

export function openCompose(request: ComposeRequest): void {
  useComposeRequest.setState({ request })
  window.dispatchEvent(new CustomEvent('clover:navigate', { detail: { section: 'mail' } }))
}

/** Parse a mailto: URL (RFC 6068) into compose fields. */
export function composeFromMailto(href: string): ComposeRequest {
  const rest = href.replace(/^mailto:/i, '')
  const [path, query = ''] = rest.split('?', 2)
  const decode = (v: string): string => {
    try {
      return decodeURIComponent(v)
    } catch {
      return v
    }
  }
  const out: ComposeRequest = { to: decode(path) }
  for (const pair of query.split('&')) {
    const [rawKey, rawValue = ''] = pair.split('=', 2)
    const key = rawKey.toLowerCase()
    const value = decode(rawValue)
    if (key === 'to') out.to = [out.to, value].filter(Boolean).join(', ')
    else if (key === 'cc') out.cc = value
    else if (key === 'subject') out.subject = value
    else if (key === 'body') out.body = value
  }
  return out
}

/** The message being written in the Mail view. */
export interface ComposeState {
  open: boolean
  to?: string
  cc?: string
  bcc?: string
  subject?: string
  body?: string
  /** Editor HTML to restore exactly (a reopened draft, or after switching views). */
  html?: string
  quote?: string
  attachments?: { name: string; path: string }[]
  inReplyTo?: string
  references?: string
  /** UID of the draft being edited (so autosave/send update or delete it). */
  draftUid?: number
  /** It had unsaved edits when it was hidden. */
  dirty?: boolean
}

/**
 * Lives outside the Mail view so a message being written survives switching to
 * Calendar or People and back (the view unmounts; the message doesn't).
 */
export const useComposeSession = create<{
  state: ComposeState
  set: (state: ComposeState) => void
}>((set) => ({
  state: { open: false },
  set: (state) => set({ state })
}))
