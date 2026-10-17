// When the server drops the connection mid-sync and then won't accept a new one,
// a full sync must reconnect once and then stop — not wait out a connect timeout
// for every remaining folder (which held up new-mail checks for minutes).
// Uses a tiny fake IMAP server on localhost and a throwaway database.
//
//   npx tsx scripts/sync-drop-smoke.ts
import net from 'node:net'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setPlatform } from '../src/core/platform'
import { closeDatabase, initDatabase } from '../src/core/db'
import { createAccount } from '../src/core/mail/accounts'
import { syncAccount } from '../src/core/mail/sync'
import type { MailEvent } from '../src/shared/mail'

const FOLDERS = ['INBOX', 'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta']

setPlatform({
  showSaveDialog: async () => ({ canceled: true }),
  showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  openPath: async () => '',
  encryptSecret: () => null,
  decryptSecret: () => null
})

let connections = 0
let examines = 0
const server = net.createServer((socket) => {
  connections += 1
  // Only the first connection works; later ones are accepted and never greeted
  // (like a server that has stopped taking this account's logins).
  if (connections > 1) return
  socket.write('* OK [CAPABILITY IMAP4rev1] fake ready\r\n')
  let buffer = ''
  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8')
    let nl: number
    while ((nl = buffer.indexOf('\r\n')) >= 0) {
      const line = buffer.slice(0, nl)
      buffer = buffer.slice(nl + 2)
      const [tag, rawCmd, ...rest] = line.split(' ')
      const cmd = (rawCmd ?? '').toUpperCase()
      const arg = rest.join(' ')
      if (cmd === 'CAPABILITY') {
        socket.write('* CAPABILITY IMAP4rev1\r\n')
      } else if (cmd === 'LIST') {
        for (const f of FOLDERS) socket.write(`* LIST () "/" "${f}"\r\n`)
      } else if (cmd === 'EXAMINE' || cmd === 'SELECT') {
        examines += 1
        if (examines === 3) {
          socket.destroy()
          return
        }
        socket.write('* 0 EXISTS\r\n* OK [UIDVALIDITY 1] ok\r\n* OK [UIDNEXT 1] ok\r\n')
        socket.write(`${tag} OK [READ-ONLY] done\r\n`)
        continue
      } else if (cmd === 'STATUS') {
        const name = /"([^"]+)"|(\S+)/.exec(arg)
        socket.write(`* STATUS "${name?.[1] ?? name?.[2]}" (MESSAGES 0 UNSEEN 0 UIDNEXT 1 UIDVALIDITY 1)\r\n`)
      } else if (cmd === 'LOGOUT') {
        socket.write(`* BYE bye\r\n${tag} OK done\r\n`)
        socket.end()
        return
      }
      socket.write(`${tag} OK done\r\n`)
    }
  })
  socket.on('error', () => undefined)
})

async function run(): Promise<void> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const port = (server.address() as net.AddressInfo).port
  initDatabase(mkdtempSync(join(tmpdir(), 'clover-syncdrop-')))
  const account = createAccount({
    email: 'u@test.local',
    password: 'p',
    incoming: { host: '127.0.0.1', port, security: 'none', username: 'u' },
    outgoing: { host: '127.0.0.1', port: 25, security: 'none', username: 'u' }
  })

  const events: MailEvent[] = []
  const started = Date.now()
  let finished = false
  try {
    await syncAccount(account.id, (e) => events.push(e))
    finished = true
  } catch {
    finished = true
  }
  const seconds = (Date.now() - started) / 1000
  const errors = events.filter((e) => e.type === 'sync:error')
  const out = {
    seconds: Math.round(seconds),
    connections,
    folderErrors: errors.length,
    // One stalled reconnect (~15-20s greeting/connect timeout), not one per folder.
    fast: seconds < 30,
    oneReconnect: connections === 2,
    stoppedEarly: errors.length <= 2 && errors.some((e) => e.type === 'sync:error' && /next time/.test(e.error ?? '')),
    finished
  }
  console.log(JSON.stringify(out))
  closeDatabase()
  server.close()
  const ok = out.fast && out.oneReconnect && out.stoppedEarly && out.finished
  console.log(ok ? 'SYNC_DROP_SMOKE_OK' : 'SYNC_DROP_SMOKE_FAIL')
  process.exit(ok ? 0 : 1)
}

void run()
