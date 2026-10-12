import { spawn } from 'node:child_process'

export function opencodeAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = spawn('opencode', ['--version'], { shell: true })
      child.on('error', () => resolve(false))
      child.on('close', (code) => resolve(code === 0))
    } catch {
      resolve(false)
    }
  })
}

export function streamOpencode(
  workspace: string,
  prompt: string,
  onDelta: (text: string) => void,
  signal: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('opencode', ['run', prompt], {
      cwd: workspace || process.cwd(),
      shell: true
    })
    const onAbort = (): void => {
      child.kill()
    }
    signal.addEventListener('abort', onAbort)
    child.stdout.on('data', (data: Buffer) => onDelta(data.toString()))
    child.stderr.on('data', (data: Buffer) => onDelta(data.toString()))
    child.on('error', (error) => {
      signal.removeEventListener('abort', onAbort)
      reject(error)
    })
    child.on('close', () => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    })
  })
}
