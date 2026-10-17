import type { MessageDetail } from '@shared/mail'
import { useAi } from '../state/ai'
import { useLayout } from '../state/layout'

export const SUMMARIZE_PROMPT =
  'Summarize this email in a few bullets, then list any action items, deadlines, or dates.'
const SUMMARIZE_THREAD_PROMPT =
  'Summarize this email conversation: what it is about, what each person wants, and where it stands now. Then list any open questions, action items (with who owns them), deadlines and dates.'

// Long conversations are trimmed from the oldest end to keep the request small.
const MAX_CHARS = 60_000

function bodyText(detail: MessageDetail): string {
  if (detail.textPlain?.trim()) return detail.textPlain.trim()
  if (detail.htmlRaw) {
    // HTML-only mail: parse it inertly (no scripts run, nothing loads) for its text.
    const doc = new DOMParser().parseFromString(detail.htmlRaw, 'text/html')
    doc.querySelectorAll('style,script,head').forEach((el) => el.remove())
    const text = (doc.body?.innerText || doc.body?.textContent || '').replace(/\n{3,}/g, '\n\n').trim()
    if (text) return text
  }
  return '(no text)'
}

export function emailText(detail: MessageDetail): string {
  return [
    `Subject: ${detail.subject ?? ''}`,
    `From: ${detail.fromName ?? ''} <${detail.fromEmail ?? ''}>`,
    `To: ${detail.to.join(', ')}`,
    ...(detail.cc.length ? [`Cc: ${detail.cc.join(', ')}`] : []),
    ...(detail.dateUtc ? [`Date: ${new Date(detail.dateUtc).toLocaleString()}`] : []),
    '',
    bodyText(detail)
  ].join('\n')
}

/** Ask the Copilot (in the side panel) about an email or conversation, starting a fresh chat. */
export async function askCopilotAbout(label: string, context: string, prompt: string): Promise<void> {
  const ai = useAi.getState()
  await ai.load()
  if (ai.streaming) ai.cancel()
  ai.clearConversation()
  ai.setContext(label, context)
  // Open the Copilot in the side panel next to the message, like the app dock.
  useLayout.getState().set({ dockOpen: true, dockKind: 'copilot' })
  void useLayout.getState().save()
  await useAi.getState().send(prompt)
}

/** Right-click → Summarize with Copilot, for one message or a whole conversation. */
export async function summarizeWithCopilot(messageId: string, whole: boolean): Promise<void> {
  if (!whole) {
    const detail = await window.clover.mail.getMessage(messageId)
    if (!detail) throw new Error('That message is no longer available')
    await askCopilotAbout(detail.subject || 'Email', emailText(detail), SUMMARIZE_PROMPT)
    return
  }
  const loaded = await window.clover.mail.getConversation(messageId)
  if (loaded.length <= 1) return summarizeWithCopilot(messageId, false)
  // The conversation view loads bodies lazily; fetch any not downloaded yet.
  const conversation: MessageDetail[] = []
  for (const m of loaded) {
    const full = m.textPlain || m.htmlRaw ? m : await window.clover.mail.getMessage(m.id).catch(() => null)
    conversation.push(full ?? m)
  }
  // Oldest first, so the summary follows the conversation as it happened.
  const parts = conversation.map(
    (m, i) => `--- Message ${i + 1} of ${conversation.length} ---\n${emailText(m)}`
  )
  let text = parts.join('\n\n')
  let dropped = 0
  while (text.length > MAX_CHARS && parts.length > 1) {
    parts.shift()
    dropped += 1
    text = parts.join('\n\n')
  }
  if (dropped) text = `(The ${dropped} oldest messages were left out for length.)\n\n${text}`
  const subject = conversation[conversation.length - 1].subject || 'Conversation'
  await askCopilotAbout(`${subject} (${conversation.length} messages)`, text, SUMMARIZE_THREAD_PROMPT)
}
