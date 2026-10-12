import { getAccountById, getAccountPassword } from './accounts'
import { buildImapClient } from './imap'
import { upsertFolders, type MailboxRecord } from './sync'

export async function createFolder(
  accountId: string,
  name: string,
  parentRemotePath?: string
): Promise<void> {
  const account = getAccountById(accountId)
  if (!account) throw new Error('Account not found')
  const password = getAccountPassword(accountId)
  if (!password) throw new Error('No stored password for account')

  const client = buildImapClient(account.incoming, password)
  await client.connect()
  try {
    const list = (await client.list()) as unknown as MailboxRecord[]
    const delimiter = list.find((m) => m.delimiter)?.delimiter ?? '/'
    const path = parentRemotePath ? `${parentRemotePath}${delimiter}${name}` : name
    await client.mailboxCreate(path)
    const refreshed = (await client.list()) as unknown as MailboxRecord[]
    upsertFolders(accountId, refreshed)
  } finally {
    await client.logout().catch(() => undefined)
  }
}
