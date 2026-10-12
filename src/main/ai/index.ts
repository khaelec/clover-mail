import type { AiChatRequest, AiStatus, AiStreamEvent } from '@shared/ai'
import { getAiSettings, getClaudeKey, hasClaudeKey } from './settings'
import { streamClaude } from './claude'
import { listOllamaModels, ollamaReachable, streamOllama } from './ollama'
import { opencodeAvailable, streamOpencode } from './opencode'

let emitter: (event: AiStreamEvent) => void = () => {}

export function setAiEmitter(fn: (event: AiStreamEvent) => void): void {
  emitter = fn
}

const controllers = new Map<string, AbortController>()

export async function runChat(request: AiChatRequest): Promise<void> {
  const controller = new AbortController()
  controllers.set(request.streamId, controller)
  const settings = getAiSettings()
  const onDelta = (text: string): void =>
    emitter({ streamId: request.streamId, type: 'delta', text })

  try {
    if (request.provider === 'claude') {
      const key = getClaudeKey()
      if (!key) throw new Error('Claude API key is not configured (Settings → AI).')
      await streamClaude(
        key,
        request.model || settings.claudeModel,
        request.system,
        request.messages,
        onDelta,
        controller.signal
      )
    } else if (request.provider === 'ollama') {
      await streamOllama(
        settings.ollamaBaseUrl,
        request.model || settings.ollamaModel,
        request.system,
        request.messages,
        onDelta,
        controller.signal
      )
    } else {
      const prompt = [request.system, ...request.messages.map((m) => `${m.role}: ${m.content}`)]
        .filter(Boolean)
        .join('\n\n')
      await streamOpencode(settings.opencodeWorkspace, prompt, onDelta, controller.signal)
    }
    emitter({ streamId: request.streamId, type: 'done' })
  } catch (error) {
    if (controller.signal.aborted) {
      emitter({ streamId: request.streamId, type: 'done' })
    } else {
      emitter({ streamId: request.streamId, type: 'error', error: (error as Error).message })
    }
  } finally {
    controllers.delete(request.streamId)
  }
}

export function cancelChat(streamId: string): void {
  controllers.get(streamId)?.abort()
  controllers.delete(streamId)
}

export async function aiStatus(): Promise<AiStatus> {
  const settings = getAiSettings()
  const [ollamaUp, opencodeUp] = await Promise.all([
    ollamaReachable(settings.ollamaBaseUrl),
    opencodeAvailable()
  ])
  const ollamaModels = ollamaUp ? await listOllamaModels(settings.ollamaBaseUrl) : []
  return {
    claudeConfigured: hasClaudeKey(),
    ollamaReachable: ollamaUp,
    ollamaModels,
    opencodeAvailable: opencodeUp
  }
}
