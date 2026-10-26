import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g
const BANNER = /^>\s*\S+\s*·/

function candidatePaths(): string[] {
  if (process.platform !== 'win32') return []
  const paths: string[] = []
  const { APPDATA, LOCALAPPDATA } = process.env
  if (APPDATA) paths.push(join(APPDATA, 'npm', 'node_modules', 'opencode-ai', 'bin', 'opencode.exe'))
  if (LOCALAPPDATA) {
    paths.push(join(LOCALAPPDATA, 'Programs', 'opencode', 'opencode.exe'))
    paths.push(join(LOCALAPPDATA, 'opencode', 'bin', 'opencode.exe'))
  }
  return paths
}

let cachedExe: string | null = null

/** Re-checked on every call so installing or updating opencode while the app runs works. */
function resolveExecutable(): string | null {
  if (cachedExe && existsSync(cachedExe)) return cachedExe
  cachedExe = candidatePaths().find((candidate) => existsSync(candidate)) ?? null
  return cachedExe
}

function executableFor(exePath?: string): string | null {
  if (exePath && existsSync(exePath)) return exePath
  return resolveExecutable()
}

/**
 * Launch the opencode CLI. When the real .exe can be found we spawn it directly
 * (so multi-line prompts are passed verbatim); otherwise we fall back to a
 * shell invocation with a flattened, quoted prompt.
 */
function spawnOpencode(
  args: string[],
  workspace: string,
  exePath?: string
): ChildProcess {
  const exe = executableFor(exePath)
  // stdin is ignored so non-interactive `opencode run` never waits for input.
  const stdio: ['ignore', 'pipe', 'pipe'] = ['ignore', 'pipe', 'pipe']
  if (exe) {
    return spawn(exe, args, {
      cwd: workspace || undefined,
      windowsHide: true,
      stdio
    })
  }
  const quote = (value: string): string =>
    `"${value.replace(/\r?\n/g, ' ').replace(/"/g, '')}"`
  const command = ['opencode', ...args.map(quote)].join(' ')
  return spawn(command, {
    shell: true,
    cwd: workspace || undefined,
    windowsHide: true,
    stdio
  })
}

/** Line-buffer a stream, dropping opencode's "> build · model" banner line. */
function makeLineFilter(emit: (line: string) => void): {
  push: (chunk: string) => void
  flush: () => void
} {
  let buffer = ''
  const deliver = (line: string): void => {
    if (!BANNER.test(line.trim())) emit(line)
  }
  return {
    push: (chunk) => {
      buffer += chunk
      let index: number
      while ((index = buffer.indexOf('\n')) >= 0) {
        deliver(buffer.slice(0, index + 1))
        buffer = buffer.slice(index + 1)
      }
    },
    flush: () => {
      if (buffer) deliver(buffer)
      buffer = ''
    }
  }
}

export function opencodeAvailable(exePath?: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawnOpencode(['--version'], '', exePath)
    let settled = false
    const done = (ok: boolean): void => {
      if (settled) return
      settled = true
      resolve(ok)
    }
    const timer = setTimeout(() => {
      child.kill()
      done(false)
    }, 8000)
    child.on('error', () => {
      clearTimeout(timer)
      done(false)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      done(code === 0)
    })
  })
}

/** List every model the opencode CLI knows about (provider/model), e.g. opencode-go/gpt-5. */
export function listOpencodeModels(exePath?: string): Promise<string[]> {
  return new Promise((resolve) => {
    const child = spawnOpencode(['models'], '', exePath)
    let output = ''
    const finish = (): void => {
      const rank = (model: string): number => {
        const provider = model.split('/')[0]
        if (provider === 'opencode-go') return 0
        if (provider === 'opencode') return 1
        return 2
      }
      const models = output
        .replace(ANSI, '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => /^[\w.-]+\/[\w./-]+$/.test(line))
      const unique = [...new Set(models)]
      // Funded/subscription providers first so the working models are easy to pick.
      unique.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
      resolve(unique)
    }
    const timer = setTimeout(() => {
      child.kill()
      finish()
    }, 15000)
    child.stdout?.on('data', (data: Buffer) => {
      output += data.toString()
    })
    child.stderr?.on('data', (data: Buffer) => {
      output += data.toString()
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve([])
    })
    child.on('close', () => {
      clearTimeout(timer)
      finish()
    })
  })
}

export function streamOpencode(
  options: { workspace: string; model?: string; exePath?: string; prompt: string },
  onDelta: (text: string) => void,
  signal: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    // A missing cwd makes spawn fail with "spawn <exe> ENOENT", which reads as if
    // opencode itself were missing. Say what's actually wrong. (No fallback folder:
    // opencode can edit files wherever it runs.)
    if (options.workspace && !existsSync(options.workspace)) {
      reject(
        new Error(
          `The opencode workspace folder "${options.workspace}" doesn't exist. Create it, or change it in Settings → AI.`
        )
      )
      return
    }
    const args = ['run']
    if (options.model && options.model !== 'default') args.push('-m', options.model)
    args.push(options.prompt)

    const child = spawnOpencode(args, options.workspace, options.exePath)
    const onAbort = (): void => {
      child.kill()
    }
    signal.addEventListener('abort', onAbort)

    // Buffer output so an error response can be reported as an error, not as a reply.
    let output = ''
    const stdoutFilter = makeLineFilter((line) => {
      output += line
    })
    const stderrFilter = makeLineFilter((line) => {
      output += line
    })
    child.stdout?.on('data', (data: Buffer) => stdoutFilter.push(data.toString().replace(ANSI, '')))
    child.stderr?.on('data', (data: Buffer) => stderrFilter.push(data.toString().replace(ANSI, '')))
    child.on('error', (error) => {
      signal.removeEventListener('abort', onAbort)
      reject(error)
    })
    child.on('close', () => {
      signal.removeEventListener('abort', onAbort)
      stdoutFilter.flush()
      stderrFilter.flush()
      const text = output.trim()
      const isError =
        /^error:/i.test(text) ||
        /insufficient account funds|model access is disabled|upstream request failed/i.test(text)
      if (isError) {
        reject(new Error(text.replace(/^error:\s*/i, '').slice(0, 300) || 'opencode failed'))
        return
      }
      if (output) onDelta(output)
      resolve()
    })
  })
}
