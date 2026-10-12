import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { AiProvider } from '@shared/ai'
import { useAi } from '../state/ai'
import { useMail } from '../state/mail'
import { IconClose, IconRefresh, IconSend, IconSparkles } from './icons'

const PROVIDERS: { value: AiProvider; label: string }[] = [
  { value: 'claude', label: 'Claude' },
  { value: 'ollama', label: 'Ollama' },
  { value: 'opencode', label: 'opencode' }
]

const MODEL_PRESETS: Record<AiProvider, string[]> = {
  claude: [
    'claude-sonnet-4-5',
    'claude-opus-4-1',
    'claude-haiku-4-5',
    'claude-3-7-sonnet-latest',
    'claude-3-5-sonnet-latest'
  ],
  ollama: [],
  opencode: ['default']
}

function StatusDot({ ok }: { ok: boolean }): ReactNode {
  return (
    <span
      className={'h-1.5 w-1.5 rounded-full ' + (ok ? 'bg-emerald-500' : 'bg-muted/50')}
      title={ok ? 'Available' : 'Unavailable / not configured'}
    />
  )
}

export function CopilotView(): ReactNode {
  const settings = useAi((s) => s.settings)
  const status = useAi((s) => s.status)
  const messages = useAi((s) => s.messages)
  const streaming = useAi((s) => s.streaming)
  const contextLabel = useAi((s) => s.contextLabel)
  const load = useAi((s) => s.load)
  const refreshStatus = useAi((s) => s.refreshStatus)
  const setProvider = useAi((s) => s.setProvider)
  const setModel = useAi((s) => s.setModel)
  const setContext = useAi((s) => s.setContext)
  const clearContext = useAi((s) => s.clearContext)
  const clearConversation = useAi((s) => s.clearConversation)
  const send = useAi((s) => s.send)
  const cancel = useAi((s) => s.cancel)

  const [input, setInput] = useState('')
  const scrollerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight })
  }, [messages])

  function useCurrentEmail(): void {
    const detail = useMail.getState().detail
    if (!detail) return
    const text = [
      `Subject: ${detail.subject ?? ''}`,
      `From: ${detail.fromName ?? ''} <${detail.fromEmail ?? ''}>`,
      `To: ${detail.to.join(', ')}`,
      '',
      detail.textPlain ?? '(HTML only)'
    ].join('\n')
    setContext(detail.subject ?? 'Current email', text)
  }

  async function submit(): Promise<void> {
    const prompt = input
    setInput('')
    await send(prompt)
  }

  const provider = settings?.provider ?? 'claude'
  const model = provider === 'ollama' ? settings?.ollamaModel : settings?.claudeModel
  const claudeReady = status?.claudeConfigured ?? false
  const providerModels =
    provider === 'ollama' ? (status?.ollamaModels ?? []) : MODEL_PRESETS[provider]
  const modelOptions = Array.from(new Set([...(model ? [model] : []), ...providerModels]))

  return (
    <div className="flex h-full min-h-0">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-line px-4 py-3">
          <IconSparkles className="h-5 w-5 text-accent" />
          <h1 className="text-[15px] font-semibold text-ink">Copilot</h1>
          <div className="ml-auto flex items-center gap-1 rounded-lg border border-line p-0.5">
            {PROVIDERS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => void setProvider(p.value)}
                className={
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] ' +
                  (provider === p.value ? 'bg-accent/12 text-accent' : 'text-muted hover:text-ink')
                }
              >
                <StatusDot
                  ok={
                    p.value === 'claude'
                      ? claudeReady
                      : p.value === 'ollama'
                        ? (status?.ollamaReachable ?? false)
                        : (status?.opencodeAvailable ?? false)
                  }
                />
                {p.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            title="Refresh status"
            onClick={() => void refreshStatus()}
            className="grid h-7 w-7 place-items-center rounded-md text-muted hover:text-accent"
          >
            <IconRefresh className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={clearConversation}
            className="rounded-lg border border-line px-2.5 py-1 text-[12px] text-muted hover:text-ink"
          >
            New
          </button>
        </header>

        <div className="flex items-center gap-2 border-b border-line px-4 py-2 text-[12px]">
          <span className="text-muted">Model</span>
          <select
            value={model ?? ''}
            onChange={(e) => {
              if (e.target.value === '__custom__') {
                const value = window.prompt('Model name:', model ?? '')
                if (value) void setModel(value)
              } else {
                void setModel(e.target.value)
              }
            }}
            className="rounded-md border border-line bg-canvas/60 px-2 py-1 text-[12px] text-ink outline-none focus:border-accent"
          >
            {modelOptions.length === 0 && <option value="">No models found</option>}
            {modelOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            <option value="__custom__">Custom…</option>
          </select>
          {provider === 'ollama' && !(status?.ollamaReachable ?? false) && (
            <span className="text-[11px] text-muted">Ollama not detected on {settings?.ollamaBaseUrl}</span>
          )}
          <span className="ml-auto" />
          <button
            type="button"
            onClick={useCurrentEmail}
            className="rounded-lg border border-line px-2.5 py-1 text-[11px] text-muted hover:text-accent"
          >
            Add current email
          </button>
        </div>

        {contextLabel && (
          <div className="flex items-center gap-2 border-b border-line bg-accent/8 px-4 py-1.5 text-[11px] text-accent">
            Context: {contextLabel}
            <button type="button" onClick={clearContext} className="text-muted hover:text-ink">
              <IconClose className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {provider === 'claude' && !claudeReady && (
          <div className="border-b border-line bg-amber-500/10 px-4 py-2 text-[12px] text-amber-600">
            Add your Anthropic API key in Settings → AI to use Claude.
          </div>
        )}

        <div ref={scrollerRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.length === 0 && (
            <div className="pt-10 text-center text-[13px] text-muted">
              Ask about your mail, summarize a thread, or draft a reply.
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ' +
                (m.role === 'user'
                  ? 'ml-auto bg-accent text-accent-ink'
                  : 'bg-canvas/70 text-ink ring-1 ring-line')
              }
            >
              {m.content || (streaming && i === messages.length - 1 ? '…' : '')}
            </div>
          ))}
        </div>

        <footer className="flex items-end gap-2 border-t border-line px-4 py-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void submit()
              }
            }}
            placeholder="Ask your copilot…"
            className="min-h-[40px] flex-1 resize-none rounded-xl border border-line bg-canvas/60 px-3 py-2 text-[13px] text-ink outline-none focus:border-accent"
          />
          {streaming ? (
            <button
              type="button"
              onClick={cancel}
              className="rounded-xl border border-line px-3 py-2 text-[13px] text-muted hover:text-rose-500"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void submit()}
              className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink"
            >
              <IconSend className="h-4 w-4" />
              Send
            </button>
          )}
        </footer>
      </section>
    </div>
  )
}
