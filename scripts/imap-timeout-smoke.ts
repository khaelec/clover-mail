// A stalled IMAP connection (TCP accepts, then goes silent) must time out and
// surface as a rejected connect — not crash the main process with an unhandled
// 'error' event. Uses a short-lived local TCP server; touches nothing else.
//
//   npx tsx scripts/imap-timeout-smoke.ts
import net from 'node:net'
import { buildImapClient } from '../src/main/mail/imap'

async function run(): Promise<void> {
  const server = net.createServer(() => {
    // Accept the connection and never send a greeting.
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const port = (server.address() as net.AddressInfo).port

  let crashed = false
  const onUncaught = (): void => {
    crashed = true
  }
  process.once('uncaughtException', onUncaught)

  const client = buildImapClient(
    { host: '127.0.0.1', port, security: 'none', username: 'u', protocol: 'imap' },
    { user: 'u', pass: 'p' },
    { connectionTimeout: 1200, greetingTimeout: 1200, socketTimeout: 1200 }
  )

  let rejected = false
  try {
    await client.connect()
  } catch {
    rejected = true
  }
  // Give any stray 'error' event a moment to fire.
  await new Promise((r) => setTimeout(r, 400))

  process.removeListener('uncaughtException', onUncaught)
  server.close()

  console.log(JSON.stringify({ rejected, crashed }))
  const ok = rejected && !crashed
  console.log(ok ? 'IMAP_TIMEOUT_SMOKE_OK' : 'IMAP_TIMEOUT_SMOKE_FAIL')
  process.exit(ok ? 0 : 1)
}

void run()
