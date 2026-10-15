import { getSecret, setSecret } from '@core/settings/secrets'
import { getSetting, setSetting } from '@core/settings'
import { refreshGoogleAccessToken } from './google'
import { refreshMicrosoftAccessToken } from './microsoft'

// OAuth client config + token refresh. Electron-free, so the engine (auth) can
// use it outside the desktop app; the interactive sign-in flow stays in main.

const GOOGLE_ID = 'oauth.google.clientId'
const GOOGLE_SECRET = 'oauth.google.clientSecret'
const MS_ID = 'oauth.microsoft.clientId'
const MS_SECRET = 'oauth.microsoft.clientSecret'

export function getGoogleConfig(): { clientId: string; clientSecret: string } {
  return {
    clientId: getSetting<string>(GOOGLE_ID) ?? '',
    clientSecret: getSecret(GOOGLE_SECRET) ?? ''
  }
}
export function setGoogleConfig(clientId: string, clientSecret?: string): void {
  setSetting(GOOGLE_ID, clientId.trim())
  if (clientSecret !== undefined) setSecret(GOOGLE_SECRET, clientSecret.trim())
}
export function googleConfigured(): boolean {
  return Boolean(getGoogleConfig().clientId)
}

export function getMicrosoftConfig(): { clientId: string; clientSecret: string } {
  return {
    clientId: getSetting<string>(MS_ID) ?? '',
    clientSecret: getSecret(MS_SECRET) ?? ''
  }
}
export function setMicrosoftConfig(clientId: string, clientSecret?: string): void {
  setSetting(MS_ID, clientId.trim())
  if (clientSecret !== undefined) setSecret(MS_SECRET, clientSecret.trim())
}
export function microsoftConfigured(): boolean {
  return Boolean(getMicrosoftConfig().clientId)
}

export async function refreshGoogle(refreshToken: string): Promise<string | null> {
  const cfg = getGoogleConfig()
  if (!cfg.clientId) return null
  return refreshGoogleAccessToken(cfg.clientId, cfg.clientSecret, refreshToken)
}

export async function refreshMicrosoft(refreshToken: string): Promise<string | null> {
  const cfg = getMicrosoftConfig()
  if (!cfg.clientId) return null
  return refreshMicrosoftAccessToken(cfg.clientId, cfg.clientSecret, refreshToken)
}
