import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { folders, messages } from '../db/schema'
import { buildAccountClient } from './auth'
import { protocolFor } from './accounts'
import { withImap } from './connection'
import { ensureFolder } from './storeMessage'
import { upsertFolders, type MailboxRecord } from './sync'

export async function createFolder(
  accountId: string,
  name: string,
  parentRemotePath?: string
): Promise<void> {
  // Local/POP3 accounts have no server folders — just add a local row.
  if (protocolFor(accountId) !== 'imap') {
    ensureFolder(accountId, name)
    return
  }

  const client = await buildAccountClient(accountId)
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

export async function renameFolder(folderId: string, newName: string): Promise<void> {
  const db = getDb()
  const folder = db.select().from(folders).where(eq(folders.id, folderId)).get()
  if (!folder) return

  if (protocolFor(folder.accountId) !== 'imap') {
    db.update(folders).set({ name: newName, remotePath: newName }).where(eq(folders.id, folderId)).run()
    return
  }

  await withImap(folder.accountId, async (client) => {
    const delimiter = folder.delimiter || '/'
    const parent = folder.remotePath.includes(delimiter)
      ? folder.remotePath.slice(0, folder.remotePath.lastIndexOf(delimiter))
      : ''
    const target = parent ? `${parent}${delimiter}${newName}` : newName
    await client.mailboxRename(folder.remotePath, target)
    db.update(folders)
      .set({ name: newName, remotePath: target })
      .where(eq(folders.id, folderId))
      .run()
  })
}

export async function deleteFolder(folderId: string): Promise<void> {
  const db = getDb()
  const folder = db.select().from(folders).where(eq(folders.id, folderId)).get()
  if (!folder) return

  if (protocolFor(folder.accountId) === 'imap') {
    await withImap(folder.accountId, async (client) => {
      await client.mailboxDelete(folder.remotePath)
    })
  }
  db.delete(messages).where(eq(messages.folderId, folderId)).run()
  db.delete(folders).where(eq(folders.id, folderId)).run()
}

export function setFolderVisible(folderId: string, visible: boolean): void {
  getDb().update(folders).set({ isVisible: visible }).where(eq(folders.id, folderId)).run()
}
