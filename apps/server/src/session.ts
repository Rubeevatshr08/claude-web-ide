import { Sandbox } from '@e2b/code-interpreter'
import { getSessionRecord, markSessionDestroyed, upsertSessionRecord } from './session-store'
import path from 'path'

import { db } from './db'
import { messagesTable } from './schema'
import { eq, asc } from 'drizzle-orm'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_call_id?: string
  tool_calls?: any[]
}

export interface Session {
  id: string
  sandbox: Sandbox
  previewUrl: string
  openCodeSessionId?: string
  activeOpenCodeProcess?: any
  pendingTurn?: Promise<void>
  idleTimer?: NodeJS.Timeout
  lastActivity: number
  chatHistory: ChatMessage[]
}

export interface OpenCodeOutputHandlers {
  onStdout?: (data: string) => void | Promise<void>
  onStderr?: (data: string) => void | Promise<void>
}

const sessions = new Map<string, Session>()

const IDLE_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
const MAX_SESSION_MS = 60 * 60 * 1000   // 1 hour hard limit
const WORKSPACE_DIR = process.env.WORKSPACE_PATH || '/home/user/workspace'

export async function createSession(
  handlers: OpenCodeOutputHandlers = {}
): Promise<Session> {
  const e2bTemplate = process.env.E2B_TEMPLATE?.trim()

  const sandbox = e2bTemplate
    ? await Sandbox.create(e2bTemplate, {
        timeoutMs: MAX_SESSION_MS,
      })
    : await Sandbox.create({
        timeoutMs: MAX_SESSION_MS,
      })
  const sessionId = sandbox.sandboxId
  console.log(`[${sessionId}] Creating sandbox...`)

  console.log(`[${sessionId}] Starting services via setup.sh...`)
  try {
    const result = await sandbox.commands.run('bash /home/user/setup.sh', {
      timeoutMs: 75000, // 75 seconds to give setup.sh 60s + some overhead
      envs: {
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "",
        OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || "anthropic/claude-3.5-sonnet",
      },
      onStdout: (data: string) => console.log(`[${sessionId}] [setup] ${data.trim()}`),
      onStderr: (data: string) => console.error(`[${sessionId}] [setup:err] ${data.trim()}`),
    })

    if (result.exitCode !== 0) {
      throw new Error(`setup.sh failed with exit code ${result.exitCode}`)
    }
  } catch (err: any) {
    console.error(`[${sessionId}] Critical: setup.sh failed.`, err)
    // We should probably kill the sandbox here as it's broken
    await sandbox.kill().catch(() => {})
    throw new Error(`Failed to initialize session: ${err.message}`)
  }

  const host = await sandbox.getHost(3000)
  const previewUrl = `https://${host}`

  const session: Session = {
    id: sessionId,
    sandbox,
    previewUrl,
    lastActivity: Date.now(),
    chatHistory: [],
  }

  sessions.set(sessionId, session)
  resetIdleTimer(sessionId, session)
  await upsertSessionRecord({
    id: sessionId,
    sandboxId: sandbox.sandboxId,
    previewUrl,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'active',
  })
  return session
}

export async function connectToSessionProcess(
  sessionId: string,
  _handlers: OpenCodeOutputHandlers = {}
): Promise<Session | undefined> {
  const existing = sessions.get(sessionId)
  if (existing) {
    existing.lastActivity = Date.now()
    resetIdleTimer(sessionId, existing)
    return existing
  }

  // Try to restore from DB
  const record = await getSessionRecord(sessionId)
  if (!record || record.status === 'destroyed') return undefined

  console.log(`[${sessionId}] Restoring session from DB...`)
  try {
    const sandbox = await Sandbox.connect(record.sandboxId)
    const rows = db.select().from(messagesTable).where(eq(messagesTable.sessionId, sessionId)).orderBy(asc(messagesTable.createdAt)).all()
    const chatHistory = rows.map(r => ({ role: r.role, content: r.content }) as ChatMessage)

    const session: Session = {
      id: sessionId,
      sandbox,
      previewUrl: record.previewUrl,
      lastActivity: Date.now(),
      chatHistory,
    }
    sessions.set(sessionId, session)
    resetIdleTimer(sessionId, session)
    return session
  } catch (err) {
    console.error(`[${sessionId}] Failed to reconnect to sandbox ${record.sandboxId}:`, err)
    return undefined
  }
}

export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId)
}

export function listActiveSessionIds(): string[] {
  return [...sessions.keys()]
}

export function touchSession(sessionId: string): void {
  const session = sessions.get(sessionId)
  if (session) {
    session.lastActivity = Date.now()
    resetIdleTimer(sessionId, session)
    void upsertSessionRecord({
      id: session.id,
      sandboxId: session.sandbox.sandboxId,
      previewUrl: session.previewUrl,
      createdAt: new Date(session.lastActivity).toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
    })
  }
}

export async function detachSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId)
  if (!session) return

  session.lastActivity = Date.now()
  resetIdleTimer(sessionId, session)
}

export async function runOpenCodeTurn(
  sessionId: string,
  prompt: string,
  handlers: OpenCodeOutputHandlers = {}
): Promise<void> {
  const session = sessions.get(sessionId)
  if (!session) {
    throw new Error(`Session ${sessionId} not found`)
  }

  // Add the prompt to history BEFORE running the turn
  session.chatHistory.push({ role: 'user', content: prompt });
  
  // Persistence: Save user message to DB
  db.insert(messagesTable).values({
    id: Math.random().toString(36).slice(2),
    sessionId,
    role: 'user',
    content: prompt,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }).run()

  const previousTurn = session.pendingTurn ?? Promise.resolve()
  const nextTurn = previousTurn.catch(() => {}).then(async () => {
    touchSession(sessionId)
    console.log(`[${sessionId}] Running OpenCode turn (Direct CLI)...`)

    try {
      // Write prompt to file to avoid shell escaping issues
      await session.sandbox.files.write('/tmp/prompt.txt', prompt);

      let fullResponse = "";
      const result = await session.sandbox.commands.run(`opencode run "$(cat /tmp/prompt.txt)"`, {
        cwd: WORKSPACE_DIR,
        envs: {
          OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "",
        },
        onStdout: async (out) => {
          fullResponse += out;
          await handlers.onStdout?.(JSON.stringify({ 
            type: 'assistant', 
            message: { content: [{ type: 'text', text: out }] } 
          }) + '\n');
        },
        onStderr: async (err) => {
          console.error(`[${sessionId}] Agent stderr:`, err);
        }
      });

      if (result.exitCode !== 0) {
        throw new Error(`OpenCode CLI failed with exit code ${result.exitCode}`);
      }

      session.chatHistory.push({ role: 'assistant', content: fullResponse });

      // Persistence: Save assistant message to DB
      db.insert(messagesTable).values({
        id: Math.random().toString(36).slice(2),
        sessionId,
        role: 'assistant',
        content: fullResponse,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).run()

      // Final result signal
      await handlers.onStdout?.(JSON.stringify({ 
        type: 'result', 
        session_id: session.openCodeSessionId || session.id 
      }) + '\n')

    } catch (error: any) {
      console.error(`[${sessionId}] Agent error:`, error)
      await handlers.onStderr?.(`Agent Error: ${error.message}\n`)
    } finally {
      touchSession(sessionId)
    }
  })

  session.pendingTurn = nextTurn
  try {
    await nextTurn
  } finally {
    if (session.pendingTurn === nextTurn) {
      session.pendingTurn = undefined
    }
  }
}

function resetIdleTimer(sessionId: string, session: Session): void {
  if (session.idleTimer) clearTimeout(session.idleTimer)
  session.idleTimer = setTimeout(async () => {
    console.log(`[${sessionId}] Idle timeout — destroying session`)
    await destroySession(sessionId)
  }, IDLE_TIMEOUT_MS)
}

export async function destroySession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId)
  if (!session) {
    await markSessionDestroyed(sessionId)
    return
  }
  if (session.idleTimer) clearTimeout(session.idleTimer)
  try {
    await session.sandbox.kill()
  } catch (err) {
    console.error(`[${sessionId}] Error killing sandbox:`, err)
  }
  sessions.delete(sessionId)
  await markSessionDestroyed(sessionId)
  console.log(`[${sessionId}] Session destroyed`)
}

export interface DeploymentResult {
  url?: string
  deployedName: string
  namespace: string
  previewUrl: string
}

export async function deploySessionToCloudflare(
  sessionId: string,
  handlers: OpenCodeOutputHandlers = {}
): Promise<DeploymentResult> {

  const session = sessions.get(sessionId)
  if (!session) {
    throw new Error(`Session ${sessionId} not found`)
  }

  const apiToken = process.env.CLOUDFLARE_API_TOKEN
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const dispatchNamespace = process.env.CLOUDFLARE_DISPATCH_NAMESPACE

  if (!apiToken || !accountId || !dispatchNamespace) {
    throw new Error('Cloudflare credentials (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_DISPATCH_NAMESPACE) are not configured on the server')
  }

  console.log(`[${sessionId}] Starting Cloudflare for Platforms deployment...`)

  // 1. Standard Next.js build for local preview
  console.log(`[${sessionId}] Running standard Next.js build for preview...`)
  const nextBuildResult = await session.sandbox.commands.run('npm run build', {
    cwd: WORKSPACE_DIR,
    timeoutMs: 0,
    envs: {
      NODE_OPTIONS: '--max-old-space-size=1536',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    onStdout: (data: string) => {
      console.log(`[${sessionId}][next-build] ${data.trim()}`)
      void handlers.onStdout?.(data)
    },
    onStderr: (data: string) => {
      console.error(`[${sessionId}][next-build:err] ${data.trim()}`)
      void handlers.onStderr?.(data)
    },
  })

  if (nextBuildResult.exitCode !== 0) {
    throw new Error(`Next.js build failed with exit code ${nextBuildResult.exitCode}`)
  }

  // 1.5. Start the production server for preview
  console.log(`[${sessionId}] Killing existing server on port 3000...`)
  await session.sandbox.commands.run('fuser -k 3000/tcp || true')

  console.log(`[${sessionId}] Starting production preview server...`)
  await session.sandbox.commands.run('npm run start', {
    cwd: WORKSPACE_DIR,
    background: true,
    onStdout: (data: string) => {
      console.log(`[${sessionId}][server] ${data.trim()}`)
      void handlers.onStdout?.(data)
    },
    onStderr: (data: string) => {
      console.error(`[${sessionId}][server:err] ${data.trim()}`)
      void handlers.onStderr?.(data)
    },
  })

  console.log(`[${sessionId}] Waiting for port 3000 to be ready...`)
  await session.sandbox.commands.run(
    "timeout 30 bash -c 'until nc -z localhost 3000; do sleep 1; done'",
    { timeoutMs: 35000 }
  )

  // 2. OpenNext/Cloudflare build for deployment
  console.log(`[${sessionId}] Running OpenNext/Cloudflare build for deployment...`)
  const cfBuildResult = await session.sandbox.commands.run('npm run build:cloudflare', {
    cwd: WORKSPACE_DIR,
    timeoutMs: 0,
    envs: {
      NODE_OPTIONS: '--max-old-space-size=1536',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    onStdout: (data: string) => {
      console.log(`[${sessionId}][cf-build] ${data.trim()}`)
      void handlers.onStdout?.(data)
    },
    onStderr: (data: string) => {
      console.error(`[${sessionId}][cf-build:err] ${data.trim()}`)
      void handlers.onStderr?.(data)
    },
  })

  if (cfBuildResult.exitCode !== 0) {
    throw new Error(`Cloudflare build failed with exit code ${cfBuildResult.exitCode}`)
  }


  // 2. Deploy to dispatch namespace
  const deployCmd = `npx -y wrangler deploy --dispatch-namespace ${dispatchNamespace} --name claude-ide-${sessionId.toLowerCase()}`

  const deployResult = await session.sandbox.commands.run(deployCmd, {
    cwd: WORKSPACE_DIR,
    timeoutMs: 0,
    envs: {
      CLOUDFLARE_API_TOKEN: apiToken,
      CLOUDFLARE_ACCOUNT_ID: accountId,
    },
    onStdout: (data: string) => {
      console.log(`[${sessionId}][deploy] ${data.trim()}`)
      void handlers.onStdout?.(data)
    },
    onStderr: (data: string) => {
      console.error(`[${sessionId}][deploy:err] ${data.trim()}`)
      void handlers.onStderr?.(data)
    },
  })

  if (deployResult.exitCode !== 0) {
    throw new Error(`Deployment failed with exit code ${deployResult.exitCode}: ${deployResult.stderr}`)
  }

  // 3. Construct the production URL using the custom domain router
  const deployedUrl = `https://${sessionId.toLowerCase()}.weboreels.com`

  // Save to DB
  void upsertSessionRecord({
    id: sessionId,
    sandboxId: session.sandbox.sandboxId,
    previewUrl: session.previewUrl,
    createdAt: new Date(session.lastActivity).toISOString(), // rough estimate
    updatedAt: new Date().toISOString(),
    status: 'active',
    deployedUrl,
  })
  
  return {
    url: deployedUrl,
    deployedName: `opencode-ide-${sessionId.toLowerCase()}`,
    namespace: dispatchNamespace,
    previewUrl: session.previewUrl,
  }
}

