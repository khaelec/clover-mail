import { createServer, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { dispatch } from './registry'

/**
 * Serves the mail engine to the mobile client. Electron-free, so it can run
 * inside the desktop app (the phone talks to the PC over the LAN) or in a
 * headless Node service.
 *
 * - `POST /rpc` with header `x-clover-token` and body `{ channel, args }`.
 * - `GET /events?token=...` — Server-Sent Events carrying the same mail/ai/update
 *   events the desktop renderer receives.
 * - `GET /*` — optionally serves the built renderer so the phone can open it in a
 *   browser (no install needed).
 */
export interface TransportOptions {
  port: number
  token: string
  /** Directory of the built renderer to serve to the browser (optional). */
  serveDir?: string
}

export interface TransportServer {
  port: number
  close: () => Promise<void>
  /** Push an event to every connected client (mirrors an IPC main->renderer send). */
  emit: (channel: string, payload: unknown) => void
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8'
}

function cors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-clover-token')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
}

export function startTransport(options: TransportOptions): Promise<TransportServer> {
  const clients = new Set<ServerResponse>()

  const server = createServer((req, res) => {
    cors(res)
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const url = new URL(req.url ?? '/', 'http://localhost')
    const token = req.headers['x-clover-token'] ?? url.searchParams.get('token')

    if (url.pathname === '/rpc' && req.method === 'POST') {
      if (token !== options.token) {
        res.writeHead(401).end('Unauthorized')
        return
      }
      const chunks: Buffer[] = []
      req.on('data', (chunk) => chunks.push(chunk as Buffer))
      req.on('end', () => {
        void (async () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
              channel?: string
              args?: unknown[]
            }
            if (!body.channel) throw new Error('Missing channel')
            const result = await dispatch(body.channel, body.args ?? [])
            res.writeHead(200, { 'content-type': 'application/json' }).end(
              JSON.stringify({ result })
            )
          } catch (error) {
            res.writeHead(200, { 'content-type': 'application/json' }).end(
              JSON.stringify({ error: error instanceof Error ? error.message : String(error) })
            )
          }
        })()
      })
      return
    }

    if (url.pathname === '/events' && req.method === 'GET') {
      if (token !== options.token) {
        res.writeHead(401).end('Unauthorized')
        return
      }
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive'
      })
      res.write(': connected\n\n')
      clients.add(res)
      req.on('close', () => clients.delete(res))
      return
    }

    // Static files for the browser client.
    if (options.serveDir && req.method === 'GET') {
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '')
      const target = normalize(join(options.serveDir, rel || 'index.html'))
      const within = normalize(options.serveDir)
      if (!target.startsWith(within)) {
        res.writeHead(403).end('Forbidden')
        return
      }
      const file = existsSync(target) && statSync(target).isFile() ? target : join(options.serveDir, 'index.html')
      if (existsSync(file)) {
        res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream' })
        res.end(readFileSync(file))
        return
      }
    }

    res.writeHead(404).end('Not found')
  })

  return new Promise((resolve) => {
    server.listen(options.port, () => {
      resolve({
        port: (server.address() as AddressInfo).port,
        close: () => new Promise<void>((done) => server.close(() => done())),
        emit: (channel, payload) => {
          const frame = `data: ${JSON.stringify({ channel, payload })}\n\n`
          for (const client of clients) {
            try {
              client.write(frame)
            } catch {
              // client gone
            }
          }
        }
      })
    })
  })
}
