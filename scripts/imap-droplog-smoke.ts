// When the server ends a connection we didn't end, the log must say so, with
// the server's goodbye text and how long the connection was up. Our own logout
// must not be logged as a drop. Uses a tiny fake IMAP server on localhost.
//
//   npx tsx scripts/imap-droplog-smoke.ts
import net from 'node:net'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initLogging } from '../src/core/log'
import { buildImapClient } from '../src/core/mail/imap'

let connections = 0
const server = net.createServer((socket) => {
  connections += 1
  const dropThisOne = connections === 1
  socket.write('* OK [CAPABILITY IMAP4rev1] fake ready\r\n')
  let buffer = ''
  socket.on('error', () => undefined)
  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8')
    let nl: number
    while ((nl = buffer.indexOf('\r\n')) >= 0) {
      const line = buffer.slice(0, nl)
      buffer = buffer.slice(nl + 2)
      const [tag, rawCmd] = line.split(' ')
      const cmd = (rawCmd ?? '').toUpperCase()
      if (cmd === 'CAPABILITY') socket.write('* CAPABILITY IMAP4rev1\r\n')
      if (cmd === 'LOGOUT') {
        socket.write(`* BYE Logging out\r\n${tag} OK bye\r\n`)
        socket.end()
        return
      }
      socket.write(`${tag} OK done\r\n`)
      if (cmd === 'LOGIN' && dropThisOne) {
        // The server gives up on the session a moment after login.
        setTimeout(() => {
          socket.write('* BYE Session expired, please login again\r\n')
          socket.end()
        }, 300)
      }
    }
  })
})

async function main(): Promise<void> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as net.AddressInfo).port
  const dir = mkdtempSync(join(tmpdir(), 'clover-droplog-'))
  initLogging(dir)
  const make = (label: string): ReturnType<typeof buildImapClient> =>
    buildImapClient(
      { host: '127.0.0.1', port, security: 'none', username: 'me' },
      { user: 'me', pass: 'x' },
      {},
      label
    )

  const dropped = make('idle me@test')
  await dropped.connect()
  await new Promise<void>((resolve) => dropped.once('close', () => resolve()))

  const polite = make('sync me@test')
  await polite.connect()
  await polite.logout()
  await new Promise((r) => setTimeout(r, 300))
  server.close()

  const log = readFileSync(join(dir, 'logs', 'main.log'), 'utf8')
  const lines = log.trim().split('\n')
  const drop = lines.find((l) => l.includes('idle me@test'))
  if (!drop || !/Session expired/.test(drop) || !/after \d+s/.test(drop)) {
    throw new Error(`drop not logged with its reason:\n${log}`)
  }
  if (lines.some((l) => l.includes('sync me@test'))) {
    throw new Error(`our own logout was logged as a drop:\n${log}`)
  }
  console.log(`OK imap drop log: ${drop.replace(/^\[[^\]]+\] /, '')}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
