import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { listAccounts } from '@core/mail/accounts'
import { listFolders } from '@core/mail/queries'
import { searchMessages } from '@core/mail/search'
import { getMessageDetail, moveMessage, setFlags } from '@core/mail/messages'
import { getMcpSettings } from './settings'

let httpServer: Server | null = null
let activePort = 0
const transports = new Map<string, StreamableHTTPServerTransport>()

function text(value: unknown): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] }
}

function buildServer(grantWrite: boolean): McpServer {
  const server = new McpServer({ name: 'clover-mail', version: '0.1.0' })

  server.tool('list_accounts', 'List the mail accounts configured in Clover Mail.', async () =>
    text(listAccounts())
  )

  server.tool(
    'list_folders',
    'List the folders of a mail account.',
    { accountId: z.string().describe('Account id from list_accounts') },
    async ({ accountId }) => text(listFolders(accountId))
  )

  server.tool(
    'search_messages',
    'Full-text search across cached messages.',
    { query: z.string(), accountId: z.string().optional() },
    async ({ query, accountId }) => text(searchMessages(query, accountId))
  )

  server.tool(
    'read_message',
    'Read one message by id (metadata + plain-text body).',
    { messageId: z.string() },
    async ({ messageId }) => {
      const detail = await getMessageDetail(messageId)
      if (!detail) return text('Message not found')
      return text({
        id: detail.id,
        subject: detail.subject,
        from: detail.fromName ?? detail.fromEmail,
        date: detail.dateUtc,
        body: (detail.textPlain ?? '').slice(0, 6000)
      })
    }
  )

  if (grantWrite) {
    server.tool(
      'mark_read',
      'Mark one message read or unread.',
      { messageId: z.string(), read: z.boolean().optional() },
      async ({ messageId, read }) => {
        await setFlags(messageId, { seen: read ?? true })
        return text(`Marked ${messageId} as ${(read ?? true) ? 'read' : 'unread'}`)
      }
    )
    server.tool(
      'move_message',
      'Move a message to another folder (use list_folders for ids).',
      { messageId: z.string(), folderId: z.string() },
      async ({ messageId, folderId }) => {
        await moveMessage(messageId, folderId)
        return text(`Moved ${messageId} to folder ${folderId}`)
      }
    )
  }

  return server
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : undefined)
      } catch {
        resolve(undefined)
      }
    })
  })
}

export function mcpRunning(): { running: boolean; port: number } {
  return { running: Boolean(httpServer), port: activePort }
}

export async function startMcpServer(): Promise<{ running: boolean; port: number }> {
  if (httpServer) return mcpRunning()
  const settings = getMcpSettings()
  const port = settings.port || 8765

  httpServer = createServer((req, res) => {
    void handle(req, res, settings.token, settings.writeToolsGranted)
  })

  await new Promise<void>((resolve) => httpServer!.listen(port, '127.0.0.1', () => resolve()))
  activePort = port
  return mcpRunning()
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  token: string,
  grantWrite: boolean
): Promise<void> {
  if (req.url !== '/mcp') {
    res.writeHead(404).end('Not found')
    return
  }
  if (token) {
    const header = req.headers['authorization']
    const custom = req.headers['x-clover-token']
    if (header !== `Bearer ${token}` && custom !== token) {
      res.writeHead(401).end('Unauthorized')
      return
    }
  }

  const sessionId = req.headers['mcp-session-id'] as string | undefined
  let transport = sessionId ? transports.get(sessionId) : undefined
  if (!transport) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        transports.set(id, transport as StreamableHTTPServerTransport)
      }
    })
    transport.onclose = () => {
      if (transport?.sessionId) transports.delete(transport.sessionId)
    }
    await buildServer(grantWrite).connect(transport)
  }

  const body = req.method === 'POST' ? await readJson(req) : undefined
  await transport.handleRequest(req, res, body)
}

export async function stopMcpServer(): Promise<void> {
  for (const transport of transports.values()) {
    await transport.close().catch(() => undefined)
  }
  transports.clear()
  if (httpServer) {
    await new Promise<void>((resolve) => httpServer!.close(() => resolve()))
    httpServer = null
    activePort = 0
  }
}
