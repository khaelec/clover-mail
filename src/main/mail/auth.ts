import type { ImapFlow } from 'imapflow'
import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { accountOauth } from '../db/schema'
import { getAccountById, getAccountPassword } from './accounts'
import { buildImapClient } from './imap'
import { getSecret } from '../settings/secrets'
import { refreshGoogle } from '../oauth'

export interface ResolvedAuth {
  user: string
  pass?: string
  accessToken?: string
}

/** Resolve credentials for an account: password, or a freshly-minted OAuth access token. */
export async function getAccountAuth(accountId: string): Promise<ResolvedAuth | null> {
  const account = getAccountById(accountId)
  if (!account) return null

  const oauth = getDb().select().from(accountOauth).where(eq(accountOauth.accountId, accountId)).get()
  if (oauth) {
    const refresh = getSecret(oauth.refreshTokenRef)
    if (!refresh) return null
    const accessToken = oauth.provider === 'google' ? await refreshGoogle(refresh) : null
    if (!accessToken) return null
    return { user: account.incoming.username, accessToken }
  }

  const pass = getAccountPassword(accountId)
  if (!pass) return null
  return { user: account.incoming.username, pass }
}

export async function buildAccountClient(accountId: string): Promise<ImapFlow> {
  const account = getAccountById(accountId)
  if (!account) throw new Error('Account not found')
  const auth = await getAccountAuth(accountId)
  if (!auth) throw new Error('No credentials for account')
  return buildImapClient(account.incoming, auth)
}
