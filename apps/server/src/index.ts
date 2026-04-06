import { WebSocketServer, WebSocket } from 'ws'
import { createServer, IncomingMessage } from 'http'
import { createSession, destroySession, touchSession } from './session'
import { v4 as uuid } from 'uuid'

// Load .env manually (no dotenv dep needed)
try {
  const env = require('fs').readFileSync('.env', 'utf-8')
  for (const line of env.split('\n')) {
    const [key, ...rest] = line.split('=')
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim()
  }
} catch {}

const PORT = Number(process.env.PORT ?? 8080)

const httpServer = createServer((req, res) => {
  // Simple health check
  if (req.url === '/health') {
    res.writeHead(200)
    res.end('ok')
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

wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
  const sessionId = uuid()
  console.log(`[${sessionId}] New WebSocket connection from ${req.socket.remoteAddress}`)

  // Notify client we're booting
  send(ws, { type: 'status', message: 'Booting sandbox — this takes ~30 seconds...' })

  let session: Awaited<ReturnType<typeof createSession>> | null = null

  try {
    session = await createSession(sessionId)
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

  // Stream Claude stdout → browser
  session.claudeProcess.stdout?.on('data', (data: string) => {
    const lines = data.split('\n').filter(Boolean)
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line)
        send(ws, { type: 'claude', payload: parsed })
      } catch {
        send(ws, { type: 'claude_raw', payload: line })
      }
    }
  })

  session.claudeProcess.stderr?.on('data', (data: string) => {
    // Claude Code emits a lot of benign noise to stderr; only surface real errors
    if (data.includes('Error') || data.includes('error')) {
      send(ws, { type: 'error', payload: data })
    }
  })

  // User messages → Claude stdin
  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString())

      if (msg.type === 'user_message') {
        touchSession(sessionId)
        const content: string = msg.content?.trim()
        if (!content) return

        await session!.claudeProcess.sendInput(content + '\n')
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
    console.log(`[${sessionId}] WebSocket closed — cleaning up`)
    await destroySession(sessionId)
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
