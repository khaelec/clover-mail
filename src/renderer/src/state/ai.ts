import { create } from 'zustand'
import type { AiChatMessage, AiProvider, AiSettings, AiStatus } from '@shared/ai'

interface AiState {
  settings: AiSettings | null
  status: AiStatus | null
  messages: AiChatMessage[]
  streaming: boolean
  currentStreamId: string | null
  error: string | null
  contextLabel: string | null
  contextText: string | null
  load: () => Promise<void>
  refreshStatus: () => Promise<void>
  setProvider: (provider: AiProvider) => Promise<void>
  setModel: (model: string) => Promise<void>
  setContext: (label: string, text: string) => void
  clearContext: () => void
  clearConversation: () => void
  send: (prompt: string) => Promise<void>
  cancel: () => void
}

function systemPrompt(contextText: string | null): string {
  const base =
    "You are Clover Mail's built-in assistant. Be concise and practical. The user is working with their email."
  return contextText ? `${base}\n\nCurrent email context:\n${contextText}` : base
}

let subscribed = false

export const useAi = create<AiState>((set, get) => ({
  settings: null,
  status: null,
  messages: [],
  streaming: false,
  currentStreamId: null,
  error: null,
  contextLabel: null,
  contextText: null,

  load: async () => {
    const settings = await window.clover.ai.getSettings()
    set({ settings })
    if (!subscribed) {
      subscribed = true
      window.clover.ai.onStream((event) => {
        if (event.streamId !== get().currentStreamId) return
        const messages = get().messages.slice()
        const last = messages[messages.length - 1]
        if (event.type === 'delta' && event.text) {
          messages[messages.length - 1] = {
            role: 'assistant',
            content: (last?.content ?? '') + event.text
          }
          set({ messages })
        } else if (event.type === 'done') {
          set({ streaming: false, currentStreamId: null })
        } else if (event.type === 'error') {
          messages[messages.length - 1] = {
            role: 'assistant',
            content: (messages[messages.length - 1]?.content ?? '') + `\n\n⚠️ ${event.error ?? 'Error'}`
          }
          set({ messages, streaming: false, currentStreamId: null, error: event.error ?? 'Error' })
        }
      })
    }
    void get().refreshStatus()
  },

  refreshStatus: async () => {
    const status = await window.clover.ai.status()
    set({ status })
  },

  setProvider: async (provider) => {
    const settings = await window.clover.ai.setSettings({ provider })
    set({ settings })
    void get().refreshStatus()
  },

  setModel: async (model) => {
    const current = get().settings
    if (!current) return
    const patch =
      current.provider === 'ollama' ? { ollamaModel: model } : { claudeModel: model }
    const settings = await window.clover.ai.setSettings(patch)
    set({ settings })
  },

  setContext: (label, text) => set({ contextLabel: label, contextText: text }),
  clearContext: () => set({ contextLabel: null, contextText: null }),
  clearConversation: () => set({ messages: [], error: null }),

  send: async (prompt) => {
    const { settings, contextText, messages } = get()
    if (!settings) return
    if (!prompt.trim() && !contextText) return

    const streamId = crypto.randomUUID()
    const next: AiChatMessage[] = [
      ...messages,
      { role: 'user', content: prompt.trim() || 'Summarize and help me with this email.' },
      { role: 'assistant', content: '' }
    ]
    set({ messages: next, streaming: true, currentStreamId: streamId, error: null })

    await window.clover.ai.chat({
      provider: settings.provider,
      model: settings.provider === 'ollama' ? settings.ollamaModel : settings.claudeModel,
      system: systemPrompt(contextText),
      messages: next.slice(0, -1),
      streamId
    })
  },

  cancel: () => {
    const streamId = get().currentStreamId
    if (streamId) void window.clover.ai.cancel(streamId)
    set({ streaming: false, currentStreamId: null })
  }
}))
