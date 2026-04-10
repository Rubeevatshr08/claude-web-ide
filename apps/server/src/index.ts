import { WebSocketServer, WebSocket } from 'ws'
import { createServer, IncomingMessage } from 'http'
import {
  createSession,
  connectToSessionProcess,
  destroySession,
  detachSession,
  listActiveSessionIds,
  runClaudeTurn,
  touchSession,
  deploySessionToCloudflare,
} from './session'
import { initSessionStore, listSessionRecords } from './session-store'

// Load .env manually (no dotenv dep needed)
try {
  const fs = require('fs')
  const path = require('path')
  const candidates = [
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(process.cwd(), 'apps/server/.env'),
    path.resolve(process.cwd(), '.env'),
  ]
  const envPath = candidates.find((candidate: string) => fs.existsSync(candidate))
  if (!envPath) throw new Error('No .env file found')
  const env = fs.readFileSync(envPath, 'utf-8')
  for (const line of env.split('\n')) {
    const [key, ...rest] = line.split('=')
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim()
  }
} catch {}

void initSessionStore().catch((err) => {
  console.error('Failed to initialize session store:', err)
  process.exit(1)
})

const PORT = Number(process.env.PORT ?? 8080)
const WEB_ORIGIN = process.env.WEB_ORIGIN

function getAllowedOrigin(origin?: string | null): string {
  if (WEB_ORIGIN) return WEB_ORIGIN
  if (!origin) return 'http://localhost:3000'

  try {
    const parsed = new URL(origin)
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return origin
    }
  } catch {}

  return 'http://localhost:3000'
}

function setCorsHeaders(req: import('http').IncomingMessage, res: import('http').ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', getAllowedOrigin(req.headers.origin))
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Vary', 'Origin')
}

const httpServer = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  setCorsHeaders(req, res)

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  // Simple health check
  if (url.pathname === '/health') {
    res.writeHead(200)
    res.end('ok')
    return
  }

  if (req.method === 'GET' && url.pathname === '/sessions') {
    void listSessionRecords()
      .then((records) => {
        const activeIds = new Set(listActiveSessionIds())
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(records.filter((record) => record.status === 'active' && activeIds.has(record.id))))
      })
      .catch((err) => {
        console.error('Failed to list sessions:', err)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Failed to list sessions' }))
      })
    return
  }

  if (req.method === 'POST' && url.pathname === '/sessions') {
    void createSession()
      .then((session) => {
        res.writeHead(201, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          sessionId: session.id,
          previewUrl: session.previewUrl,
          sandboxId: session.sandbox.sandboxId,
        }))
      })
      .catch((err) => {
        console.error('Failed to create session via API:', err)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Failed to create session' }))
      })
    return
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/sessions/')) {
    const sessionId = decodeURIComponent(url.pathname.replace('/sessions/', '')).trim()

    if (!sessionId) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'sessionId is required' }))
      return
    }

    void destroySession(sessionId)
      .then(() => {
        res.writeHead(204)
        res.end()
      })
      .catch((err) => {
        console.error(`[${sessionId}] Failed to destroy session via API:`, err)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Failed to destroy session' }))
      })
    return
  }

  if (req.method === 'POST' && url.pathname.match(/\/sessions\/[^/]+\/deploy/)) {
    const sessionId = decodeURIComponent(url.pathname.split('/')[2]).trim()

    if (!sessionId) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'sessionId is required' }))
      return
    }

    void deploySessionToCloudflare(sessionId)
      .then((url) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ url }))
      })
      .catch((err) => {
        console.error(`[${sessionId}] Failed to deploy session via API:`, err)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message || 'Failed to deploy session' }))
      })
    return
  }

  res.writeHead(404)
  res.end()
})

const wss = new WebSocketServer({ server: httpServer })

function send(ws: WebSocket, data: object) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data))
  }
}

function getSessionId(req: IncomingMessage): string {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  return url.searchParams.get('sessionId')?.trim() || ''
}

function createClaudeHandlers(ws: WebSocket) {
  let stdoutBuffer = ''

  return {
    onStdout: (data: string) => {
      stdoutBuffer += data
      const lines = stdoutBuffer.split('\n')
      stdoutBuffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          send(ws, { type: 'claude', payload: JSON.parse(line) })
        } catch {
          send(ws, { type: 'claude_raw', payload: line })
        }
      }
    },
    onStderr: (data: string) => {
      if (data.includes('Error') || data.includes('error')) {
        send(ws, { type: 'error', payload: data })
      }
    },
  }
}

wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
  const sessionId = getSessionId(req)
  console.log(`[${sessionId}] New WebSocket connection from ${req.socket.remoteAddress}`)

  // Notify client we're booting
  send(ws, { type: 'status', message: 'Booting sandbox — this takes ~30 seconds...' })

  let session: Awaited<ReturnType<typeof createSession>> | null = null

  try {
    if (!sessionId) {
      throw new Error('sessionId is required')
    }
    const handlers = createClaudeHandlers(ws)
    session = (await connectToSessionProcess(sessionId, handlers)) ?? null
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }
  } catch (err: any) {
    console.error(`[${sessionId}] Failed to create session:`, err)
    send(ws, { type: 'error', payload: `Failed to start sandbox: ${err.message}` })
    ws.close()
    return
  }

  // Send ready + preview URL
  send(ws, {
    type: 'ready',
    previewUrl: session.previewUrl,
    sessionId,
  })

  // User messages → Claude stdin
  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString())

      if (msg.type === 'user_message') {
        touchSession(sessionId)
        const content: string = msg.content?.trim()
        if (!content) return

        send(ws, { type: 'claude_turn_started' })
        await runClaudeTurn(sessionId, content, createClaudeHandlers(ws))
      }

      if (msg.type === 'ping') {
        touchSession(sessionId)
        send(ws, { type: 'pong' })
      }
    } catch (err) {
      console.error(`[${sessionId}] Error handling message:`, err)
    }
  })

  // Cleanup on disconnect
  ws.on('close', async () => {
    console.log(`[${sessionId}] WebSocket closed — detaching session`)
    await detachSession(sessionId)
  })

  ws.on('error', (err) => {
    console.error(`[${sessionId}] WebSocket error:`, err)
  })
})

httpServer.listen(PORT, () => {
  console.log(`WebSocket server listening on port ${PORT}`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received — shutting down')
  wss.close()
  httpServer.close()
  process.exit(0)
})
