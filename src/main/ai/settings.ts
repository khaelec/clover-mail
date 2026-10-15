import { getSetting, setSetting } from '@core/settings'
import { getSecret, setSecret } from '@core/settings/secrets'
import {
  DEFAULT_AI_SETTINGS,
  DEFAULT_MCP_SETTINGS,
  type AiSettings,
  type McpSettings
} from '@shared/ai'

const AI_KEY = 'ai.settings'
const MCP_KEY = 'mcp.settings'
const CLAUDE_SECRET = 'anthropic-api-key'

export function getAiSettings(): AiSettings {
  return { ...DEFAULT_AI_SETTINGS, ...(getSetting<Partial<AiSettings>>(AI_KEY) ?? {}) }
}

export function setAiSettings(patch: Partial<AiSettings>): AiSettings {
  const next = { ...getAiSettings(), ...patch }
  setSetting(AI_KEY, next)
  return next
}

export function getClaudeKey(): string | undefined {
  return getSecret(CLAUDE_SECRET)
}

export function setClaudeKey(key: string): void {
  setSecret(CLAUDE_SECRET, key)
}

export function hasClaudeKey(): boolean {
  return Boolean(getClaudeKey())
}

export function getMcpSettings(): McpSettings {
  return { ...DEFAULT_MCP_SETTINGS, ...(getSetting<Partial<McpSettings>>(MCP_KEY) ?? {}) }
}

export function setMcpSettings(patch: Partial<McpSettings>): McpSettings {
  const next = { ...getMcpSettings(), ...patch }
  setSetting(MCP_KEY, next)
  return next
}
