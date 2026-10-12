export type AiProvider = 'claude' | 'ollama' | 'opencode'

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AiChatRequest {
  provider: AiProvider
  model?: string
  system?: string
  messages: AiChatMessage[]
  streamId: string
}

export interface AiStreamEvent {
  streamId: string
  type: 'delta' | 'done' | 'error'
  text?: string
  error?: string
}

export interface AiSettings {
  provider: AiProvider
  claudeModel: string
  ollamaBaseUrl: string
  ollamaModel: string
  opencodeWorkspace: string
}

export interface AiStatus {
  claudeConfigured: boolean
  ollamaReachable: boolean
  ollamaModels: string[]
  opencodeAvailable: boolean
}

export interface McpSettings {
  enabled: boolean
  port: number
  token: string
  writeToolsGranted: boolean
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: 'claude',
  claudeModel: 'claude-sonnet-4-5',
  ollamaBaseUrl: 'http://127.0.0.1:11434',
  ollamaModel: 'llama3.1',
  opencodeWorkspace: ''
}

export const DEFAULT_MCP_SETTINGS: McpSettings = {
  enabled: false,
  port: 8765,
  token: '',
  writeToolsGranted: false
}
