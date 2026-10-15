import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'

const MAX_BYTES = 1_000_000

let logFile = ''

/** Point logging at <userData>/logs/main.log. Only ever writes into our own folder. */
export function initLogging(userDataDir: string): void {
  try {
    const dir = join(userDataDir, 'logs')
    mkdirSync(dir, { recursive: true })
    logFile = join(dir, 'main.log')
  } catch {
    logFile = ''
  }
}

/** Append one line, rotating the file when it grows too large. Never throws. */
export function logLine(scope: string, message: string): void {
  if (!logFile) return
  try {
    if (existsSync(logFile) && statSync(logFile).size > MAX_BYTES) {
      renameSync(logFile, `${logFile}.1`)
    }
    appendFileSync(logFile, `[${new Date().toISOString()}] [${scope}] ${message}\n`)
  } catch {
    // Logging must never break the app.
  }
}

export function logError(scope: string, error: unknown): void {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  logLine(scope, message)
}

/** The last `limit` lines of the log, for the "Copy diagnostics" button. */
export function readRecentLogs(limit = 200): string {
  if (!logFile || !existsSync(logFile)) return ''
  try {
    const lines = readFileSync(logFile, 'utf8').split('\n')
    return lines.slice(-limit).join('\n')
  } catch {
    return ''
  }
}
