import { getSetting, setSetting, deleteSetting } from './index'
import { platform } from '../platform'

const PREFIX = 'secret:'

/**
 * Encrypt a secret with the OS keychain (via the platform service) and persist
 * it. Falls back to a clearly-marked plaintext value only when the OS backend is
 * unavailable, so callers can detect and warn.
 */
export function setSecret(key: string, plaintext: string): void {
  const encrypted = platform().encryptSecret(plaintext)
  if (encrypted) {
    setSetting(PREFIX + key, { encrypted: true, value: encrypted })
  } else {
    setSetting(PREFIX + key, { encrypted: false, value: plaintext })
  }
}

export function getSecret(key: string): string | undefined {
  const record = getSetting<{ encrypted: boolean; value: string }>(PREFIX + key)
  if (!record) return undefined
  if (!record.encrypted) return record.value
  return platform().decryptSecret(record.value) ?? undefined
}

export function deleteSecret(key: string): void {
  deleteSetting(PREFIX + key)
}
