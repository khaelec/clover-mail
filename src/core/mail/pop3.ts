import net from 'node:net'
import tls from 'node:tls'
import { simpleParser } from 'mailparser'
import { and, eq, isNotNull } from 'drizzle-orm'
import { getDb } from '@core/db'
import { folders, messages } from '@core/db/schema'
import { getAccountById } from './accounts'
import { getAccountAuth } from './auth'
import { ensureInboxFolder, nextUidForFolder, storeParsedMessage } from './storeMessage'
import type { EndpointInput, MailEvent, SyncResult } from '@shared/mail'

type Emit = (event: MailEvent) => void

class LineReader {
  private lines: string[] = []
  private resolvers: ((line: string) => void)[] = []

  push(line: string): void {
    const resolver = this.resolvers.shift()
    if (resolver) resolver(line)
    else this.lines.push(line)
  }

  read(): Promise<string> {
    const buffered = this.lines.shift()
    if (buffered !== undefined) return Promise.resolve(buffered)
    return new Promise((resolve) => this.resolvers.push(resolve))
  }
}

class Pop3Client {
  private socket: net.Socket | null = null
  private reader = new LineReader()
  private leftover = ''

  connect(settings: EndpointInput): Promise<void> {
    return new Promise((resolve, reject) => {
      const onReady = (): void => {
        void this.reader
          .read()
          .then((greeting) => {
            if (!greeting.startsWith('+OK')) {
              reject(new Error('POP3 server refused the connection'))
              return
            }
            resolve()
          })
          .catch(reject)
      }

      const secure = settings.security === 'ssl'
      this.socket = secure
        ? tls.connect(
            { host: settings.host, port: settings.port, rejectUnauthorized: settings.security !== 'none' },
            onReady
          )
        : net.connect({ host: settings.host, port: settings.port }, onReady)

      this.socket.on('data', (chunk: Buffer) => this.feed(chunk))
      this.socket.on('error', (error: Error) => reject(error))
    })
  }

  private feed(chunk: Buffer): void {
    this.leftover += chunk.toString('utf8')
    let index: number
    while ((index = this.leftover.indexOf('\n')) >= 0) {
      let line = this.leftover.slice(0, index)
      this.leftover = this.leftover.slice(index + 1)
      if (line.endsWith('\r')) line = line.slice(0, -1)
      this.reader.push(line)
    }
  }

  private async command(line: string): Promise<string> {
    if (!this.socket) throw new Error('Not connected')
    this.socket.write(`${line}\r\n`)
    const response = await this.reader.read()
    if (!response.startsWith('+OK')) {
      throw new Error(response.replace(/^-ERR\s*/i, '').trim() || 'POP3 command failed')
    }
    return response
  }

  private async commandMultiline(line: string): Promise<string[]> {
    await this.command(line)
    const out: string[] = []
    for (;;) {
      const next = await this.reader.read()
      if (next === '.') break
      out.push(next.startsWith('..') ? next.slice(1) : next)
    }
    return out
  }

  async login(user: string, pass: string): Promise<void> {
    await this.command(`USER ${user}`)
    await this.command(`PASS ${pass}`)
  }

  async stat(): Promise<number> {
    const response = await this.command('STAT')
    const count = Number(response.split(/\s+/)[1] ?? '0')
    return Number.isFinite(count) ? count : 0
  }

  async uidl(): Promise<{ num: number; uidl: string }[]> {
    const lines = await this.commandMultiline('UIDL')
    return lines
      .map((line) => {
        const [num, uidl] = line.trim().split(/\s+/)
        return { num: Number(num), uidl }
      })
      .filter((item) => Number.isFinite(item.num) && item.uidl)
  }

  async retr(num: number): Promise<Buffer> {
    const lines = await this.commandMultiline(`RETR ${num}`)
    return Buffer.from(lines.join('\r\n'), 'utf8')
  }

  async dele(num: number): Promise<void> {
    await this.command(`DELE ${num}`)
  }

  async quit(): Promise<void> {
    try {
      await this.command('QUIT')
    } catch {
      // ignore
    }
    this.socket?.end()
  }

  close(): void {
    this.socket?.destroy()
  }
}

export async function testPop3(settings: EndpointInput, auth: { user: string; pass?: string }): Promise<string> {
  if (!auth.pass) throw new Error('POP3 requires a password')
  const client = new Pop3Client()
  await client.connect(settings)
  try {
    await client.login(auth.user, auth.pass)
    await client.stat()
    return 'POP3 connection succeeded'
  } finally {
    await client.quit().catch(() => undefined)
  }
}

export async function fetchPop3(accountId: string, emit: Emit): Promise<SyncResult> {
  const account = getAccountById(accountId)
  if (!account) throw new Error('Account not found')
  const auth = await getAccountAuth(accountId)
  if (!auth?.pass) throw new Error('POP3 accounts need a password (OAuth is not supported).')

  emit({ type: 'sync:start', accountId })
  const client = new Pop3Client()
  await client.connect(account.incoming)

  const folderId = ensureInboxFolder(accountId)
  let fetched = 0

  try {
    await client.login(account.incoming.username, auth.pass)
    const db = getDb()
    const seen = new Set(
      db
        .select({ uidl: messages.pop3Uidl })
        .from(messages)
        .where(and(eq(messages.accountId, accountId), isNotNull(messages.pop3Uidl)))
        .all()
        .map((row) => row.uidl)
    )

    let uid = nextUidForFolder(folderId)
    const remote = await client.uidl()
    for (const item of remote) {
      if (seen.has(item.uidl)) continue
      const source = await client.retr(item.num)
      const parsed = await simpleParser(source)
      storeParsedMessage(accountId, folderId, uid, parsed, source, {
        pop3Uidl: item.uidl,
        unread: true
      })
      uid += 1
      fetched += 1
      emit({
        type: 'sync:progress',
        accountId,
        folderId,
        folderName: 'Inbox',
        fetched
      })
    }

    const folder = db.select().from(folders).where(eq(folders.id, folderId)).get()
    if (folder) {
      const total = db.select().from(messages).where(eq(messages.folderId, folderId)).all().length
      db.update(folders)
        .set({ totalCount: total, unreadCount: total })
        .where(eq(folders.id, folderId))
        .run()
    }
  } finally {
    await client.quit().catch(() => undefined)
  }

  emit({ type: 'sync:done', accountId, fetched })
  return { folders: 1, fetched }
}
