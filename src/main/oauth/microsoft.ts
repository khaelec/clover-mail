const AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
export const MICROSOFT_SCOPE =
  'offline_access openid email profile https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send'

export interface MicrosoftTokens {
  access_token: string
  refresh_token?: string
  expires_in?: number
  id_token?: string
}

export function microsoftAuthUrl(
  clientId: string,
  redirectUri: string,
  codeChallenge: string,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    response_mode: 'query',
    scope: MICROSOFT_SCOPE,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state
  })
  return `${AUTH_URL}?${params.toString()}`
}

export async function exchangeMicrosoftCode(options: {
  clientId: string
  clientSecret: string
  code: string
  verifier: string
  redirectUri: string
}): Promise<MicrosoftTokens> {
  const body = new URLSearchParams({
    client_id: options.clientId,
    code: options.code,
    code_verifier: options.verifier,
    grant_type: 'authorization_code',
    redirect_uri: options.redirectUri,
    scope: MICROSOFT_SCOPE
  })
  if (options.clientSecret) body.set('client_secret', options.clientSecret)

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  })
  if (!response.ok) {
    throw new Error(`Microsoft token exchange failed: ${response.status} ${await response.text()}`)
  }
  return (await response.json()) as MicrosoftTokens
}

export async function refreshMicrosoftAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string | null> {
  const body = new URLSearchParams({
    client_id: clientId,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: MICROSOFT_SCOPE
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

export function emailFromMicrosoftIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null
  try {
    const payload = idToken.split('.')[1]
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      preferred_username?: string
      email?: string
      upn?: string
    }
    return json.preferred_username ?? json.email ?? json.upn ?? null
  } catch {
    return null
  }
}
