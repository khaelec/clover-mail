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

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token.trim())
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
