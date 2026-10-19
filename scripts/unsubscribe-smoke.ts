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
import { listUnsubscribeFromHeaders, unsubscribe } from '../src/core/mail/unsubscribe'
import { buildDraftMessage } from '../src/core/mail/drafts'

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

  // Older mail: the header-only fetch (folded, any case) finds the same link.
  const fromHeaders = JSON.parse(
    listUnsubscribeFromHeaders(
      'list-unsubscribe: <mailto:x@shop.test>,\r\n <https://shop.test/u/9>\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n\r\n'
    )
  )
  assert(fromHeaders.http === 'https://shop.test/u/9' && fromHeaders.oneClick === true, `headers parse ${JSON.stringify(fromHeaders)}`)
  assert(listUnsubscribeFromHeaders('\r\n') === '', 'no header should store "checked, none"')

  // Drafts: a pasted picture and a non-ASCII subject make a proper MIME message.
  const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='
  const raw = await buildDraftMessage({
    to: ['ann@x.test'],
    bcc: ['boss@x.test'],
    subject: 'Café plans ☕',
    text: 'see pic',
    html: `<p>see pic</p><img src="data:image/png;base64,${pixel.repeat(200)}">`
  })
  const draft = await simpleParser(raw, { keepCidLinks: true })
  assert(draft.subject === 'Café plans ☕', `draft subject ${draft.subject}`)
  assert(draft.attachments.length === 1 && draft.attachments[0].cid, 'picture not an inline part')
  assert(typeof draft.html === 'string' && draft.html.includes(`cid:${draft.attachments[0].cid}`), 'html does not point at the picture')
  assert(raw.toString('utf8').split('\r\n').every((l) => l.length <= 998), 'a line is over 998 characters')
  assert(/^Bcc: boss@x.test/m.test(raw.toString('utf8')), 'draft lost its Bcc')

  server.close()
  closeDatabase()
  console.log('OK unsubscribe + drafts: one-click POST, web page fallback, header backfill, draft MIME with inline picture')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
