/**
 * Android OAuth stub. Google/Microsoft sign-in on the phone needs Custom Tabs +
 * PKCE with a redirect back to the app (PLAN-mobile.md Phase 3). Until then the
 * engine only supports app-password accounts, and these channels report that.
 */
const NOT_AVAILABLE = 'Sign-in with Google/Microsoft is not available on Android yet — use an app password.'

export function googleConfigured(): boolean {
  return false
}
export function microsoftConfigured(): boolean {
  return false
}
export function getGoogleConfig(): unknown {
  return null
}
export function getMicrosoftConfig(): unknown {
  return null
}
export function setGoogleConfig(): void {}
export function setMicrosoftConfig(): void {}
export async function startGoogleOAuth(): Promise<never> {
  throw new Error(NOT_AVAILABLE)
}
export async function startMicrosoftOAuth(): Promise<never> {
  throw new Error(NOT_AVAILABLE)
}
