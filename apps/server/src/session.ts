import { Sandbox, CommandHandle } from '@e2b/code-interpreter'
import { getSessionRecord, markSessionDestroyed, upsertSessionRecord } from './session-store'
import path from 'path'

import { runOpenCodeTurnDirect, ChatMessage } from './agent/opencodeAgent'
import { db } from './db'
import { messagesTable } from './schema'
import { eq, asc } from 'drizzle-orm'

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

  if (e2bTemplate) {
    console.log(`[${sessionId}] Using prebuilt E2B template: ${e2bTemplate}`)
  } else {
    await runFallbackSetup(sessionId, sandbox)
  }

  console.log(`[${sessionId}] Setup complete. Seeding core files and clearing port 3000...`)

  // Aggressively kill anything on port 3000
  const killCmd = `
    fuser -k 3000/tcp || true
    kill -9 $(lsof -t -i:3000) 2>/dev/null || true
    kill -9 $(netstat -nlp | grep :3000 | awk '{print $7}' | cut -d/ -f1) 2>/dev/null || true
  `
  await sandbox.commands.run(killCmd).catch(() => {})

  // Ensure essential Next.js files exist to prevent "missing required components" errors
  await sandbox.commands.run('mkdir -p pages styles', { cwd: WORKSPACE_DIR })
  
  const _appContent = `import '../styles/globals.css'
import type { AppProps } from 'next/app'

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}`
  const _documentContent = `import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="en">
      <Head />
      <body className="bg-black text-white">
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}`
  const globalsCss = `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  background: black;
  color: white;
}`

  const nextConfigContent = `/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    allowedDevOrigins: ['*']
  }
};
export default nextConfig;`

  await sandbox.files.write(path.join(WORKSPACE_DIR, 'pages/_app.tsx'), _appContent)
  await sandbox.files.write(path.join(WORKSPACE_DIR, 'pages/_document.tsx'), _documentContent)
  await sandbox.files.write(path.join(WORKSPACE_DIR, 'styles/globals.css'), globalsCss)
  await sandbox.files.write(path.join(WORKSPACE_DIR, 'next.config.mjs'), nextConfigContent)

  // Clear Next.js cache to prevent ENOENT errors
  await sandbox.commands.run('rm -rf .next', { cwd: WORKSPACE_DIR }).catch(() => {})

  // Start Next.js dev server explicitly on port 3000
  void sandbox.commands.run('CHOKIDAR_USEPOLLING=true CHOKIDAR_INTERVAL=500 HOSTNAME=0.0.0.0 PORT=3000 npm run dev', {
    cwd: WORKSPACE_DIR,
    background: true,
    onStdout: (data) => console.log(`[${sessionId}] [dev] ${data.trim()}`),
    onStderr: (data) => console.error(`[${sessionId}] [dev:err] ${data.trim()}`),
  })

  // Wait for port 3000 (up to 60s)
  console.log(`[${sessionId}] Waiting for port 3000...`)
  try {
    await sandbox.commands.run(
      "timeout 60 bash -c 'until nc -z localhost 3000; do sleep 1; done'",
      { timeoutMs: 65000 }
    )
  } catch (err) {
    console.warn(`[${sessionId}] Warning: Port 3000 did not become ready in time.`)
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

async function runFallbackSetup(sessionId: string, sandbox: Sandbox): Promise<void> {
  console.log(`[${sessionId}] No E2B_TEMPLATE configured; running fallback setup script...`)

  const fs = await import('fs')
  const path = await import('path')
  const candidates = [
    path.resolve(__dirname, '../../setup.sh'),
    path.resolve(__dirname, '../setup.sh'),
    path.resolve(process.cwd(), 'setup.sh'),
  ]
  const setupPath = candidates.find((candidate) => fs.existsSync(candidate))

  if (!setupPath) {
    throw new Error('setup.sh not found — checked: ' + candidates.join(', '))
  }

  const setupScript = fs.readFileSync(setupPath, 'utf-8')
  await sandbox.files.write('/setup.sh', setupScript)

  const setupResult = await sandbox.commands.run('bash /setup.sh', {
    timeoutMs: 5 * 60 * 1000,
    onStdout: (data) => console.log(`[setup] ${data}`),
    onStderr: (data) => console.error(`[setup:err] ${data}`),
  })

  if (setupResult.exitCode !== 0) {
    await sandbox.kill()
    throw new Error(`Setup failed with exit code ${setupResult.exitCode}`)
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
    console.log(`[${sessionId}] Running OpenCode turn (Direct OpenRouter)...`)

    try {
      const fullResponse = await runOpenCodeTurnDirect(
        session.sandbox,
        session.chatHistory,
        handlers
      );

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
    onStdout: (data) => {
      console.log(`[${sessionId}][next-build] ${data.trim()}`)
      void handlers.onStdout?.(data)
    },
    onStderr: (data) => {
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
    onStdout: (data) => {
      console.log(`[${sessionId}][server] ${data.trim()}`)
      void handlers.onStdout?.(data)
    },
    onStderr: (data) => {
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
    onStdout: (data) => {
      console.log(`[${sessionId}][cf-build] ${data.trim()}`)
      void handlers.onStdout?.(data)
    },
    onStderr: (data) => {
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
    onStdout: (data) => {
      console.log(`[${sessionId}][deploy] ${data.trim()}`)
      void handlers.onStdout?.(data)
    },
    onStderr: (data) => {
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

