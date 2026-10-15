import type { ReactNode } from 'react'
import { useSettings } from './context'
import { Card, Field } from './ui'

export function AiTab(): ReactNode {
  const { ai, aiStatus, apiKey, setApiKey, saveKey, patchAi, mcp, patchMcp, mcpRunning, setMcpRunning } =
    useSettings()
  return (
    <>
      <Card title="AI copilot">
        <div className="space-y-4">
          <div className="rounded-xl border border-line p-3">
            <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-ink">
              Claude
              <span className={'h-1.5 w-1.5 rounded-full ' + (aiStatus?.claudeConfigured ? 'bg-emerald-500' : 'bg-muted/50')} />
            </div>
            <Field
              label="Anthropic API key"
              type="password"
              value={apiKey}
              onChange={setApiKey}
              placeholder={aiStatus?.claudeConfigured ? '•••••• (saved)' : 'sk-ant-…'}
            />
            <div className="mt-2 flex items-end gap-2">
              <button type="button" onClick={saveKey} className="rounded-lg bg-accent px-3 py-2 text-[12px] font-medium text-accent-ink">
                Save key
              </button>
              <Field label="Claude model" value={ai?.claudeModel ?? ''} onChange={(v) => void patchAi({ claudeModel: v })} hint="Anthropic model id, e.g. claude-sonnet-4-5. Choose one in the Copilot’s model dropdown." />
            </div>
          </div>

          <div className="rounded-xl border border-line p-3">
            <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-ink">
              Ollama (local)
              <span className={'h-1.5 w-1.5 rounded-full ' + (aiStatus?.ollamaReachable ? 'bg-emerald-500' : 'bg-muted/50')} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Base URL" value={ai?.ollamaBaseUrl ?? ''} onChange={(v) => void patchAi({ ollamaBaseUrl: v })} hint="Where Ollama listens locally. Default http://127.0.0.1:11434." />
              <Field label="Model" value={ai?.ollamaModel ?? ''} onChange={(v) => void patchAi({ ollamaModel: v })} hint="An installed Ollama model, e.g. llama3.1 or qwen2.5. Models are auto-detected in the Copilot." />
            </div>
            {aiStatus && aiStatus.ollamaModels.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {aiStatus.ollamaModels.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => void patchAi({ ollamaModel: m })}
                    className={
                      'rounded-md border px-2 py-0.5 text-[11px] ' +
                      (ai?.ollamaModel === m ? 'border-accent text-accent' : 'border-line text-muted hover:text-ink')
                    }
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-line p-3">
            <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-ink">
              opencode
              <span className={'h-1.5 w-1.5 rounded-full ' + (aiStatus?.opencodeAvailable ? 'bg-emerald-500' : 'bg-muted/50')} />
            </div>
            <Field
              label="Workspace folder"
              value={ai?.opencodeWorkspace ?? ''}
              onChange={(v) => void patchAi({ opencodeWorkspace: v })}
              placeholder="C:\\path\\to\\project"
              hint="Folder where the opencode CLI runs when you use the opencode provider."
            />
            <Field
              label="Model"
              value={ai?.opencodeModel ?? 'default'}
              onChange={(v) => void patchAi({ opencodeModel: v })}
              placeholder="default"
              hint="provider/model, e.g. opencode/gpt-5. Leave as 'default' to use your opencode config. All models are listed in the Copilot."
            />
            <Field
              label="opencode executable (optional)"
              value={ai?.opencodePath ?? ''}
              onChange={(v) => void patchAi({ opencodePath: v })}
              placeholder="C:\\Users\\you\\AppData\\Roaming\\npm\\node_modules\\opencode-ai\\bin\\opencode.exe"
              hint="Only needed if Clover Mail can't find the opencode CLI automatically."
            />
            {aiStatus && aiStatus.opencodeModels.length > 0 && (
              <div className="mt-2 max-h-40 space-y-2 overflow-y-auto rounded-lg border border-line p-2">
                {(() => {
                  const groups = new Map<string, { full: string; label: string }[]>()
                  for (const entry of aiStatus.opencodeModels) {
                    const slash = entry.indexOf('/')
                    const provider = slash >= 0 ? entry.slice(0, slash) : 'models'
                    const label = slash >= 0 ? entry.slice(slash + 1) : entry
                    const list = groups.get(provider) ?? []
                    list.push({ full: entry, label })
                    groups.set(provider, list)
                  }
                  return [...groups.entries()].map(([provider, items]) => (
                    <div key={provider}>
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                        {provider}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {items.map((it) => (
                          <button
                            key={it.full}
                            type="button"
                            title={it.full}
                            onClick={() => void patchAi({ opencodeModel: it.full })}
                            className={
                              'rounded-full border px-2 py-0.5 text-[11px] ' +
                              (ai?.opencodeModel === it.full
                                ? 'border-accent text-accent'
                                : 'border-line text-muted hover:text-ink')
                            }
                          >
                            {it.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                })()}
              </div>
            )}
            <p className="mt-1 text-[11px] text-muted">
              Runs the opencode CLI in this folder when you use the opencode provider.
            </p>
          </div>
        </div>
      </Card>

      <Card title="Model Context Protocol (MCP)">
        <div className="space-y-3">
          <button type="button" onClick={() => void patchMcp({ enabled: !mcp?.enabled })} className="flex w-full items-center justify-between gap-4 text-left">
            <span>
              <span className="block text-[13px] text-ink">Enable Clover Mail MCP server</span>
              <span className="mt-0.5 block text-[12px] text-muted">Expose read tools (list/search/read) to Claude and other MCP clients.</span>
            </span>
            <span className={'relative h-6 w-11 shrink-0 rounded-full transition-colors ' + (mcp?.enabled ? 'bg-accent' : 'bg-line')}>
              <span className={'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ' + (mcp?.enabled ? 'left-[22px]' : 'left-0.5')} />
            </span>
          </button>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Port" type="number" value={mcp?.port ?? 8765} onChange={(v) => void patchMcp({ port: Number(v) || 0 })} hint="Local TCP port the MCP server listens on (127.0.0.1)." />
            <Field label="Auth token" value={mcp?.token ?? ''} onChange={(v) => void patchMcp({ token: v })} placeholder="optional" hint="Shared secret MCP clients must send. Recommended if anything else runs locally." />
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void window.clover.ai.mcpStart().then((r) => setMcpRunning(r.running))} className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-accent-ink">
              Start
            </button>
            <button type="button" onClick={() => void window.clover.ai.mcpStop().then(() => setMcpRunning(false))} className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-muted hover:text-ink">
              Stop
            </button>
            <span className={'text-[12px] ' + (mcpRunning ? 'text-emerald-500' : 'text-muted')}>
              {mcpRunning ? `Running on 127.0.0.1:${mcp?.port}` : 'Stopped'}
            </span>
          </div>
          <p className="text-[11px] text-muted">Endpoint: <code>http://127.0.0.1:{mcp?.port ?? 8765}/mcp</code></p>
        </div>
      </Card>
    </>
  )
}
