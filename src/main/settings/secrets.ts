import { safeStorage } from 'electron'
import { getSetting, setSetting, deleteSetting } from './index'

const PREFIX = 'secret:'

/**
 * Encrypt a secret with the OS keychain (Windows DPAPI via Electron safeStorage)
 * and persist it. Falls back to a clearly-marked plaintext value only when the
 * OS backend is unavailable, so callers can detect and warn.
 */
export function setSecret(key: string, plaintext: string): void {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(plaintext).toString('base64')
    setSetting(PREFIX + key, { encrypted: true, value: encrypted })
  } else {
    setSetting(PREFIX + key, { encrypted: false, value: plaintext })
  }
}

export function getSecret(key: string): string | undefined {
  const record = getSetting<{ encrypted: boolean; value: string }>(PREFIX + key)
  if (!record) return undefined
  if (!record.encrypted) return record.value
  try {
    return safeStorage.decryptString(Buffer.from(record.value, 'base64'))
  } catch {
    return undefined
  }
}

export function deleteSecret(key: string): void {
  deleteSetting(PREFIX + key)
}
