import { createServer } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { BrowserWindow } from 'electron'
import { getSecret, setSecret } from '../settings/secrets'
import { getSetting, setSetting } from '../settings'
import {
  emailFromIdToken,
  exchangeGoogleCode,
  googleAuthUrl,
  refreshGoogleAccessToken
} from './google'
import {
  emailFromMicrosoftIdToken,
  exchangeMicrosoftCode,
  microsoftAuthUrl,
  refreshMicrosoftAccessToken
} from './microsoft'
import { createOAuthAccount } from '../mail/accounts'
import type { AccountSummary } from '@shared/mail'

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

function base64url(buffer: Buffer): string {
  return buffer.toString('base64url')
}

async function loopbackAuth(
  buildUrl: (redirectUri: string) => string,
  title: string
): Promise<{ code?: string; error?: string; redirectUri: string }> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const port = (server.address() as AddressInfo).port
  const redirectUri = `http://127.0.0.1:${port}`

  const codePromise = new Promise<{ code?: string; error?: string }>((resolve) => {
    server.on('request', (req, res) => {
      const url = new URL(req.url ?? '', redirectUri)
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(
        '<html><body style="font-family:sans-serif;padding:2rem">You can close this window and return to Clover Mail.</body></html>'
      )
      resolve({
        code: url.searchParams.get('code') ?? undefined,
        error:
          url.searchParams.get('error_description') ??
          url.searchParams.get('error') ??
          undefined
      })
    })
  })

  const win = new BrowserWindow({ width: 520, height: 720, title, autoHideMenuBar: true })
  void win.loadURL(buildUrl(redirectUri))
  const result = await codePromise
  win.close()
  server.close()
  return { ...result, redirectUri }
}

export async function startGoogleOAuth(): Promise<AccountSummary> {
  const cfg = getGoogleConfig()
  if (!cfg.clientId) throw new Error('Google OAuth client ID is not configured (Settings → Accounts).')

  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  const state = base64url(randomBytes(16))

  const { code, error, redirectUri } = await loopbackAuth(
    (uri) => googleAuthUrl(cfg.clientId, uri, challenge, state),
    'Sign in with Google'
  )
  if (error || !code) throw new Error(error ?? 'Authorization cancelled')

  const tokens = await exchangeGoogleCode({
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    code,
    verifier,
    redirectUri
  })
  if (!tokens.refresh_token) {
    throw new Error('Google did not return a refresh token. Remove Clover Mail from your Google account and try again.')
  }
  const email = emailFromIdToken(tokens.id_token)
  if (!email) throw new Error('Could not read the account email from Google.')

  return createOAuthAccount({ email, provider: 'google', refreshToken: tokens.refresh_token })
}

export async function startMicrosoftOAuth(): Promise<AccountSummary> {
  const cfg = getMicrosoftConfig()
  if (!cfg.clientId) throw new Error('Microsoft OAuth client ID is not configured (Settings → Accounts).')

  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  const state = base64url(randomBytes(16))

  const { code, error, redirectUri } = await loopbackAuth(
    (uri) => microsoftAuthUrl(cfg.clientId, uri, challenge, state),
    'Sign in with Microsoft'
  )
  if (error || !code) throw new Error(error ?? 'Authorization cancelled')

  const tokens = await exchangeMicrosoftCode({
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    code,
    verifier,
    redirectUri
  })
  if (!tokens.refresh_token) {
    throw new Error('Microsoft did not return a refresh token. Try removing Clover Mail from your connected apps and retry.')
  }
  const email = emailFromMicrosoftIdToken(tokens.id_token)
  if (!email) throw new Error('Could not read the account email from Microsoft.')

  return createOAuthAccount({ email, provider: 'microsoft', refreshToken: tokens.refresh_token })
}
