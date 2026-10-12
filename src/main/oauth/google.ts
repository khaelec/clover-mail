const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
export const GOOGLE_SCOPE = 'https://mail.google.com/ openid email profile'

export interface GoogleTokens {
  access_token: string
  refresh_token?: string
  expires_in?: number
  id_token?: string
}

export function googleAuthUrl(
  clientId: string,
  redirectUri: string,
  codeChallenge: string,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPE,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
    state
  })
  return `${AUTH_URL}?${params.toString()}`
}

export async function exchangeGoogleCode(options: {
  clientId: string
  clientSecret: string
  code: string
  verifier: string
  redirectUri: string
}): Promise<GoogleTokens> {
  const body = new URLSearchParams({
    client_id: options.clientId,
    code: options.code,
    code_verifier: options.verifier,
    grant_type: 'authorization_code',
    redirect_uri: options.redirectUri
  })
  if (options.clientSecret) body.set('client_secret', options.clientSecret)

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  })
  if (!response.ok) {
    throw new Error(`Google token exchange failed: ${response.status} ${await response.text()}`)
  }
  return (await response.json()) as GoogleTokens
}

export async function refreshGoogleAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string | null> {
  const body = new URLSearchParams({
    client_id: clientId,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  })
  if (clientSecret) body.set('client_secret', clientSecret)

  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body
    })
    if (!response.ok) return null
    const json = (await response.json()) as { access_token?: string }
    return json.access_token ?? null
  } catch {
    return null
  }
}

export function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null
  try {
    const payload = idToken.split('.')[1]
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      email?: string
    }
    return json.email ?? null
  } catch {
    return null
  }
}
