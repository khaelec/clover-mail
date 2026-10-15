/**
 * Mobile-shell helpers. On the phone the renderer is served from a static bundle
 * (Capacitor / a plain browser) and the mail engine runs on the desktop, so the
 * client needs to know which desktop to talk to and the access token.
 */

const BASE_KEY = 'clover.base'
const TOKEN_KEY = 'clover.token'

interface CapacitorGlobal {
  isNativePlatform?: () => boolean
}

/** True inside the Capacitor native shell (Android/iOS), false in a browser/Electron. */
export function isNative(): boolean {
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor
  return cap?.isNativePlatform?.() === true
}

/** The desktop transport base URL (e.g. http://192.168.1.5:8787), or '' if unset. */
export function getBase(): string {
  try {
    return localStorage.getItem(BASE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setBase(url: string): void {
  try {
    localStorage.setItem(BASE_KEY, url.trim().replace(/\/+$/, ''))
  } catch {
    // storage unavailable
  }
}

/**
 * The access token is a secret, so in the native shell it lives in the Android
 * Keystore (via secure storage); elsewhere it falls back to localStorage. A
 * token saved by an older build in localStorage is migrated on first read.
 */
export async function getToken(): Promise<string> {
  if (isNative()) {
    try {
      const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
      const stored = await SecureStorage.get(TOKEN_KEY)
      if (typeof stored === 'string' && stored) return stored
      const legacy = localStorage.getItem(TOKEN_KEY)
      if (legacy) {
        await SecureStorage.set(TOKEN_KEY, legacy)
        localStorage.removeItem(TOKEN_KEY)
        return legacy
      }
      return ''
    } catch {
      // fall through to localStorage
    }
  }
  try {
    return localStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

export async function setToken(token: string): Promise<void> {
  const value = token.trim()
  if (isNative()) {
    try {
      const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
      if (value) await SecureStorage.set(TOKEN_KEY, value)
      else await SecureStorage.remove(TOKEN_KEY)
      return
    } catch {
      // fall through to localStorage
    }
  }
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // storage unavailable
  }
}

/** Normalise user input ("192.168.1.5:8787") into a full URL. */
export function normalizeBase(input: string): string {
  let url = input.trim()
  if (!url) return ''
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`
  return url.replace(/\/+$/, '')
}
