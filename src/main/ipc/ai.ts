import { ipcMain, type BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/channels'
import type { AiChatRequest, AiSettings, McpSettings } from '@shared/ai'
import { aiStatus, cancelChat, runChat, setAiEmitter } from '@main/ai'
import { getAiSettings, getMcpSettings, setAiSettings, setClaudeKey, setMcpSettings } from '@main/ai/settings'
import { listOllamaModels } from '@main/ai/ollama'
import { listOpencodeModels } from '@main/ai/opencode'
import { startMcpServer, stopMcpServer } from '@main/ai/mcpServer'
export function registerAiIpc(getWindow: () => BrowserWindow | null): void {
  setAiEmitter((event) => getWindow()?.webContents.send(IpcChannels.ai.stream, event))

  ipcMain.handle(IpcChannels.ai.getSettings, () => getAiSettings())
  ipcMain.handle(
    IpcChannels.ai.setSettings,
    (_e, patch: Partial<AiSettings> & { claudeApiKey?: string }) => {
      const { claudeApiKey, ...rest } = patch
      if (claudeApiKey) setClaudeKey(claudeApiKey)
      return setAiSettings(rest)
    }
  )
  ipcMain.handle(IpcChannels.ai.status, () => aiStatus())
  ipcMain.handle(IpcChannels.ai.listModels, (_e, provider: string) => {
    const settings = getAiSettings()
    if (provider === 'ollama') return listOllamaModels(settings.ollamaBaseUrl)
    if (provider === 'opencode') return listOpencodeModels(settings.opencodePath)
    return Promise.resolve([])
  })
  ipcMain.handle(IpcChannels.ai.chat, (_e, request: AiChatRequest) => runChat(request))
  ipcMain.handle(IpcChannels.ai.cancel, (_e, streamId: string) => cancelChat(streamId))

  ipcMain.handle(IpcChannels.ai.getMcpSettings, () => getMcpSettings())
  ipcMain.handle(IpcChannels.ai.setMcpSettings, (_e, patch: Partial<McpSettings>) =>
    setMcpSettings(patch)
  )
  ipcMain.handle(IpcChannels.ai.mcpStart, () => startMcpServer())
  ipcMain.handle(IpcChannels.ai.mcpStop, () => stopMcpServer())
}
