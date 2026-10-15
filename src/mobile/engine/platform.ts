import type { Platform } from '@core/platform'

/**
 * Android `Platform` for the engine. File pickers and share sheets need
 * Capacitor plugins bridged through the message channel (PLAN-mobile.md Phase 2
 * exit / Phase 5); for now imports and "open with" are inert.
 *
 * Secrets: the desktop encrypts with the OS keychain and falls back to plaintext
 * when unavailable. The phone's Keystore is wired in a later step, so this
 * returns null for now — the same plaintext fallback the desktop uses.
 */
export function androidPlatform(): Platform {
  return {
    async showSaveDialog() {
      return { canceled: true, filePath: undefined }
    },
    async showOpenDialog() {
      return { canceled: true, filePaths: [] }
    },
    async openPath() {
      return ''
    },
    encryptSecret() {
      return null
    },
    decryptSecret() {
      return null
    }
  }
}
