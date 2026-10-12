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
import { createOAuthAccount } from '../mail/accounts'
import type { AccountSummary } from '@shared/mail'

const CLIENT_ID_KEY = 'oauth.google.clientId'
const CLIENT_SECRET_KEY = 'oauth.google.clientSecret'

export function getGoogleConfig(): { clientId: string; clientSecret: string } {
  return {
    clientId: getSetting<string>(CLIENT_ID_KEY) ?? '',
    clientSecret: getSecret(CLIENT_SECRET_KEY) ?? ''
  }
}

export function setGoogleConfig(clientId: string, clientSecret?: string): void {
  setSetting(CLIENT_ID_KEY, clientId.trim())
  if (clientSecret !== undefined) setSecret(CLIENT_SECRET_KEY, clientSecret.trim())
}

export function googleConfigured(): boolean {
  return Boolean(getGoogleConfig().clientId)
}

export async function refreshGoogle(refreshToken: string): Promise<string | null> {
  const cfg = getGoogleConfig()
  if (!cfg.clientId) return null
  return refreshGoogleAccessToken(cfg.clientId, cfg.clientSecret, refreshToken)
}

function base64url(buffer: Buffer): string {
  return buffer.toString('base64url')
}

export async function startGoogleOAuth(): Promise<AccountSummary> {
  const cfg = getGoogleConfig()
  if (!cfg.clientId) {
    throw new Error('Google OAuth client ID is not configured (Settings → Accounts).')
  }

  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  const state = base64url(randomBytes(16))

  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const port = (server.address() as AddressInfo).port
  const redirectUri = `http://127.0.0.1:${port}`

  const codePromise = new Promise<{ code?: string; error?: string }>((resolve) => {
    server.on('request', (req, res) => {
      const url = new URL(req.url ?? '', redirectUri)
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<html><body style="font-family:sans-serif;padding:2rem">You can close this window and return to Clover Mail.</body></html>')
      resolve({
        code: url.searchParams.get('code') ?? undefined,
        error: url.searchParams.get('error') ?? undefined
      })
    })
  })

  const win = new BrowserWindow({
    width: 520,
    height: 720,
    title: 'Sign in with Google',
    autoHideMenuBar: true
  })
  void win.loadURL(googleAuthUrl(cfg.clientId, redirectUri, challenge, state))

  const { code, error } = await codePromise
  win.close()
  server.close()

  if (error || !code) throw new Error(error ? `Authorization failed: ${error}` : 'Authorization cancelled')

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

  return createOAuthAccount({
    email,
    provider: 'google',
    refreshToken: tokens.refresh_token
  })
}
