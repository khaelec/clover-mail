/**
 * Platform services the engine needs but that differ per host (Electron desktop
 * vs. a headless Node/server process for the mobile client). Engine modules call
 * `platform()`; the desktop registers the Electron implementation in
 * `platformElectron.ts`. Nothing here imports Electron, so the engine can be
 * reused outside Electron.
 */
export interface SaveDialogResult {
  canceled: boolean
  filePath?: string
}

export interface OpenDialogResult {
  canceled: boolean
  filePaths: string[]
}

export interface OpenDialogFilter {
  name: string
  extensions: string[]
}

export interface Platform {
  showSaveDialog(defaultPath: string): Promise<SaveDialogResult>
  showOpenDialog(options: {
    title?: string
    filters?: OpenDialogFilter[]
  }): Promise<OpenDialogResult>
  /** Open a file with the OS default app. Returns '' on success, else an error. */
  openPath(path: string): Promise<string>
  /** Encrypt with the OS keychain, or null when unavailable (store plaintext). */
  encryptSecret(plaintext: string): string | null
  decryptSecret(encoded: string): string | null
}

let impl: Platform | null = null

export function setPlatform(next: Platform): void {
  impl = next
}

export function platform(): Platform {
  if (!impl) throw new Error('Platform not configured')
  return impl
}
