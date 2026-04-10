import { Sandbox, CommandHandle } from '@e2b/code-interpreter'
import { markSessionDestroyed, upsertSessionRecord } from './session-store'

export interface Session {
  id: string
  sandbox: Sandbox
  previewUrl: string
  claudeSessionId?: string
  activeClaudeProcess?: CommandHandle
  pendingTurn?: Promise<void>
  idleTimer?: NodeJS.Timeout
  lastActivity: number
}

export interface ClaudeOutputHandlers {
  onStdout?: (data: string) => void | Promise<void>
  onStderr?: (data: string) => void | Promise<void>
}

const sessions = new Map<string, Session>()

const IDLE_TIMEOUT_MS = 15 * 60 * 1000 // 15 minutes
const MAX_SESSION_MS = 60 * 60 * 1000   // 1 hour hard limit
const CLAUDE_BIN = '/home/user/.local/bin/claude'
const WORKSPACE_DIR = '/home/user/workspace'

export async function createSession(
  handlers: ClaudeOutputHandlers = {}
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

  console.log(`[${sessionId}] Setup complete. Getting preview URL...`)

  const host = await sandbox.getHost(3000)
  const previewUrl = `https://${host}`

  const session: Session = {
    id: sessionId,
    sandbox,
    previewUrl,
    lastActivity: Date.now(),
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
  _handlers: ClaudeOutputHandlers = {}
): Promise<Session | undefined> {
  const session = sessions.get(sessionId)
  if (!session) return undefined

  session.lastActivity = Date.now()
  resetIdleTimer(sessionId, session)
  return session
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

export async function runClaudeTurn(
  sessionId: string,
  prompt: string,
  handlers: ClaudeOutputHandlers = {}
): Promise<void> {
  const session = sessions.get(sessionId)
  if (!session) {
    throw new Error(`Session ${sessionId} not found`)
  }

  const previousTurn = session.pendingTurn ?? Promise.resolve()
  const nextTurn = previousTurn.catch(() => {}).then(async () => {
    touchSession(sessionId)
    console.log(`[${sessionId}] Running Claude turn...`)

    const escapedPrompt = JSON.stringify(prompt)
    const resumeArg = session.claudeSessionId
      ? ` --resume ${JSON.stringify(session.claudeSessionId)}`
      : ''

    let stdoutBuffer = ''
    const claudeProcess = await session.sandbox.commands.run(
      `${CLAUDE_BIN} --dangerously-skip-permissions -p --output-format stream-json --verbose${resumeArg} ${escapedPrompt}`,
      {
        cwd: WORKSPACE_DIR,
        timeoutMs: 0,
        envs: {
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
          PATH: `/home/user/.local/bin:${process.env.PATH ?? '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'}`,
        },
        onStdout: async (data) => {
          stdoutBuffer += data
          await handlers.onStdout?.(data)
        },
        onStderr: handlers.onStderr,
        background: true,
      }
    )

    session.activeClaudeProcess = claudeProcess

    try {
      await claudeProcess.wait()
    } finally {
      session.activeClaudeProcess = undefined
      for (const line of stdoutBuffer.split('\n')) {
        if (!line.trim()) continue
        try {
          const parsed = JSON.parse(line)
          if (parsed.type === 'result' && typeof parsed.session_id === 'string') {
            session.claudeSessionId = parsed.session_id
          }
        } catch {}
      }
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

export async function deploySessionToCloudflare(sessionId: string): Promise<string> {
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

  // 1. Run build
  const buildResult = await session.sandbox.commands.run('npm run build', {
    cwd: WORKSPACE_DIR,
    timeoutMs: 5 * 60 * 1000,
  })

  if (buildResult.exitCode !== 0) {
    throw new Error(`Build failed with exit code ${buildResult.exitCode}: ${buildResult.stderr}`)
  }

  // 2. Deploy to dispatch namespace
  const deployCmd = `npx -y wrangler deploy --dispatch-namespace ${dispatchNamespace} --name claude-ide-${sessionId.toLowerCase()}`

  const deployResult = await session.sandbox.commands.run(deployCmd, {
    cwd: WORKSPACE_DIR,
    timeoutMs: 5 * 60 * 1000,
    envs: {
      CLOUDFLARE_API_TOKEN: apiToken,
      CLOUDFLARE_ACCOUNT_ID: accountId,
    },
  })

  if (deployResult.exitCode !== 0) {
    throw new Error(`Deployment failed with exit code ${deployResult.exitCode}: ${deployResult.stderr}`)
  }

  // 3. Extract URL or success message from wrangler output
  const match = deployResult.stdout.match(/https:\/\/[a-zA-Z0-9.-]+\.workers\.dev/)
  if (match) {
    return match[0]
  }

  return `Deployment successful to namespace ${dispatchNamespace} as claude-ide-${sessionId.toLowerCase()}`
}
