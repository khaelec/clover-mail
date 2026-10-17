// Unsubscribe: the List-Unsubscribe header is stored with the message, shows up
// on the message detail, and Unsubscribe does a one-click POST when the sender
// supports it (or hands back the web page when it doesn't). Uses a throwaway
// database and a local web server.
//
//   npx tsx scripts/unsubscribe-smoke.ts
import http from 'node:http'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { simpleParser } from 'mailparser'
import { setPlatform } from '../src/core/platform'
import { closeDatabase, getDb, initDatabase } from '../src/core/db'
import { accounts, folders } from '../src/core/db/schema'
import { storeParsedMessage } from '../src/core/mail/storeMessage'
import { getMessageDetail } from '../src/core/mail/messages'
import { unsubscribe } from '../src/core/mail/unsubscribe'

setPlatform({
  showSaveDialog: async () => ({ canceled: true }),
  showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  openPath: async () => '',
  encryptSecret: () => null,
  decryptSecret: () => null
})

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

const posts: { url: string; body: string; type: string }[] = []
const server = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    posts.push({ url: req.url ?? '', body, type: String(req.headers['content-type'] ?? '') })
    res.writeHead(req.method === 'POST' ? 200 : 405).end()
  })
})

async function store(uid: number, headers: string): Promise<string> {
  const source = Buffer.from(
    `From: News <news@shop.test>\r\nTo: me@test.local\r\nSubject: Deals ${uid}\r\nMessage-ID: <m${uid}@shop.test>\r\n${headers}Content-Type: text/plain\r\n\r\nHello\r\n`
  )
  const parsed = await simpleParser(source)
  return storeParsedMessage('acc1', 'inbox', uid, parsed, source)
}

async function main(): Promise<void> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`

  initDatabase(mkdtempSync(join(tmpdir(), 'clover-unsub-')))
  const db = getDb()
  db.insert(accounts).values({ id: 'acc1', email: 'me@test.local', isEnabled: true, createdAt: Date.now() }).run()
  db.insert(folders).values({ id: 'inbox', accountId: 'acc1', remotePath: 'INBOX', name: 'INBOX', specialUse: 'inbox' }).run()

  // One-click (RFC 8058), header folded over two lines.
  const oneClick = await store(
    1,
    `List-Unsubscribe: <mailto:leave@shop.test?subject=stop>,\r\n <${base}/u/abc>\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n`
  )
  const d1 = await getMessageDetail(oneClick)
  assert(d1?.unsubscribe?.oneClick === true, `one-click not detected: ${JSON.stringify(d1?.unsubscribe)}`)
  assert(d1?.unsubscribe?.http === `${base}/u/abc`, 'http link not parsed')
  assert(d1?.unsubscribe?.mailto === 'mailto:leave@shop.test?subject=stop', 'mailto not parsed')
  const r1 = await unsubscribe(oneClick)
  assert(r1.status === 'done', `one-click result ${JSON.stringify(r1)}`)
  assert(
    posts.length === 1 && posts[0].url === '/u/abc' && posts[0].body === 'List-Unsubscribe=One-Click',
    `wrong POST ${JSON.stringify(posts)}`
  )

  // Web page only: nothing is posted, the page is handed back to open.
  const webOnly = await store(2, `List-Unsubscribe: <${base}/page>\r\n`)
  const r2 = await unsubscribe(webOnly)
  assert(r2.status === 'open' && r2.url === `${base}/page`, `web-only result ${JSON.stringify(r2)}`)
  assert(posts.length === 1, 'web-only link was posted to')

  // No header: no button.
  const plain = await store(3, '')
  assert((await getMessageDetail(plain))?.unsubscribe === null, 'plain message shows unsubscribe')

  server.close()
  closeDatabase()
  console.log('OK unsubscribe: one-click POST, web page fallback, plain mail has none')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
