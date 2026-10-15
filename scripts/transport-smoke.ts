// Transport smoke test: the HTTP/SSE server dispatches RPC calls to registered
// channels, rejects a missing token, and pushes events over SSE. Uses node:http
// (not fetch) so teardown is clean on Windows.
//
//   npx tsx scripts/transport-smoke.ts
import http from 'node:http'
import { registerChannel } from '../src/core/transport/registry'
import { startTransport } from '../src/core/transport/server'

function rpc(
  port: number,
  token: string | null,
  body: unknown
): Promise<{ status: number; json: { result?: unknown; error?: string } | null }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const headers: Record<string, string | number> = {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(data)
    }
    if (token) headers['x-clover-token'] = token
    const req = http.request({ host: '127.0.0.1', port, path: '/rpc', method: 'POST', headers }, (res) => {
      let buf = ''
      res.on('data', (c) => (buf += c))
      res.on('end', () => {
        let json: { result?: unknown; error?: string } | null = null
        try {
          json = JSON.parse(buf)
        } catch {
          // non-JSON body (e.g. 401 Unauthorized)
        }
        resolve({ status: res.statusCode ?? 0, json })
      })
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

async function run(): Promise<void> {
  const out: Record<string, boolean> = {}

  registerChannel('test.echo', (value) => `echo:${value}`)
  registerChannel('test.add', (a, b) => Number(a) + Number(b))

  const server = await startTransport({ port: 0, token: 'secret' })
  const port = server.port

  const ok = await rpc(port, 'secret', { channel: 'test.add', args: [2, 3] })
  out.rpcDispatches = ok.json?.result === 5

  const unknown = await rpc(port, 'secret', { channel: 'nope' })
  out.unknownChannelErrors = typeof unknown.json?.error === 'string'

  const noToken = await rpc(port, null, { channel: 'test.add', args: [1, 1] })
  out.missingTokenRejected = noToken.status === 401

  // Server-Sent Events
  let buffer = ''
  const sseReq = await new Promise<http.ClientRequest>((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/events?token=secret' }, (res) => {
      res.on('data', (c) => (buffer += c.toString()))
    })
    req.on('error', () => undefined)
    // Give the connection a moment to establish, then emit.
    setTimeout(() => resolve(req), 150)
  })
  server.emit('mail.events', { type: 'mail:refresh' })
  const deadline = Date.now() + 2000
  while (Date.now() < deadline && !buffer.includes('mail.events')) {
    await new Promise((r) => setTimeout(r, 50))
  }
  out.eventDelivered = buffer.includes('mail.events')
  sseReq.destroy()

  await server.close()

  console.log(JSON.stringify(out, null, 2))
  const passed = Object.values(out).every(Boolean)
  console.log(passed ? 'TRANSPORT_SMOKE_OK' : 'TRANSPORT_SMOKE_FAIL')
  process.exit(passed ? 0 : 1)
}

void run()
