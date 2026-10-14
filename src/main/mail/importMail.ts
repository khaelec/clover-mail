import { readFileSync } from 'node:fs'
import { simpleParser } from 'mailparser'
import { platform } from '../platform'
import { ensureLocalAccount } from './accounts'
import { ensureFolder, nextUidForFolder, storeParsedMessage } from './storeMessage'

const LOCAL_EMAIL = 'imported@clover.local'

export interface MboxImportResult {
  imported: number
  skipped: number
  accountId: string
  folderId: string
}

/** Split a Unix mbox stream into individual raw messages. */
function splitMbox(text: string): Buffer[] {
  const out: Buffer[] = []
  const lines = text.split(/\r?\n/)
  let current: string[] | null = null
  for (const line of lines) {
    if (/^From \S+ .*\d{4}/.test(line)) {
      if (current) out.push(Buffer.from(current.join('\n'), 'utf8'))
      current = []
    } else if (current) {
      current.push(line)
    }
  }
  if (current) out.push(Buffer.from(current.join('\n'), 'utf8'))
  return out.filter((buffer) => buffer.length > 0)
}

export async function importMboxFile(filePath: string): Promise<MboxImportResult> {
  const account = ensureLocalAccount(LOCAL_EMAIL, 'Imported Mail')
  const folderId = ensureFolder(account.id, 'Imported')
  const parts = splitMbox(readFileSync(filePath, 'utf8'))

  let imported = 0
  let skipped = 0
  let uid = nextUidForFolder(folderId)
  for (const source of parts) {
    try {
      const parsed = await simpleParser(source)
      storeParsedMessage(account.id, folderId, uid, parsed, source)
      uid += 1
      imported += 1
    } catch {
      skipped += 1
    }
  }

  return { imported, skipped, accountId: account.id, folderId }
}

export async function pickAndImportMbox(): Promise<MboxImportResult | null> {
  const result = await platform().showOpenDialog({
    title: 'Import mailbox',
    filters: [
      { name: 'Mailbox', extensions: ['mbox', 'mbx', 'eml'] },
      { name: 'All files', extensions: ['*'] }
    ]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return importMboxFile(result.filePaths[0])
}
