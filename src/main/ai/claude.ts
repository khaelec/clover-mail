import type { AiChatMessage } from '@shared/ai'

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'

export async function streamClaude(
  apiKey: string,
  model: string,
  system: string | undefined,
  messages: AiChatMessage[],
  onDelta: (text: string) => void,
  signal: AbortSignal
): Promise<void> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': API_VERSION
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      stream: true,
      ...(system ? { system } : {}),
      messages: messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role, content: m.content }))
    }),
    signal
  })

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Claude API ${response.status}: ${detail.slice(0, 300)}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let index = buffer.indexOf('\n\n')
    while (index >= 0) {
      const chunk = buffer.slice(0, index)
      buffer = buffer.slice(index + 2)
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (!data || data === '[DONE]') continue
        try {
          const event = JSON.parse(data) as { type?: string; delta?: { text?: string } }
          if (event.type === 'content_block_delta' && event.delta?.text) onDelta(event.delta.text)
        } catch {
          // Ignore keep-alive / non-JSON lines.
        }
      }
      index = buffer.indexOf('\n\n')
    }
  }
}
