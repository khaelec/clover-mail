import type { AiChatMessage } from '@shared/ai'

function base(url: string): string {
  return url.replace(/\/+$/, '')
}

export async function ollamaReachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${base(url)}/api/tags`, { signal: AbortSignal.timeout(1500) })
    return response.ok
  } catch {
    return false
  }
}

export async function listOllamaModels(url: string): Promise<string[]> {
  try {
    const response = await fetch(`${base(url)}/api/tags`)
    if (!response.ok) return []
    const json = (await response.json()) as { models?: { name: string }[] }
    return (json.models ?? []).map((m) => m.name)
  } catch {
    return []
  }
}

export async function streamOllama(
  url: string,
  model: string,
  system: string | undefined,
  messages: AiChatMessage[],
  onDelta: (text: string) => void,
  signal: AbortSignal
): Promise<void> {
  const chatMessages = system
    ? [{ role: 'system', content: system }, ...messages]
    : messages

  const response = await fetch(`${base(url)}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages: chatMessages, stream: true }),
    signal
  })

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Ollama ${response.status}: ${detail.slice(0, 300)}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let index = buffer.indexOf('\n')
    while (index >= 0) {
      const line = buffer.slice(0, index).trim()
      buffer = buffer.slice(index + 1)
      if (line) {
        try {
          const event = JSON.parse(line) as {
            message?: { content?: string }
            done?: boolean
          }
          if (event.message?.content) onDelta(event.message.content)
          if (event.done) return
        } catch {
          // Ignore partial lines.
        }
      }
      index = buffer.indexOf('\n')
    }
  }
}
