import { Sandbox } from '@e2b/code-interpreter'

export interface Session {
  sandbox: Sandbox
  previewUrl: string
  claudeProcess: any // E2B process handle
  idleTimer?: NodeJS.Timeout
  lastActivity: number
}

const sessions = new Map<string, Session>()

const IDLE_TIMEOUT_MS = 15 * 60 * 1000 // 15 minutes
const MAX_SESSION_MS = 60 * 60 * 1000   // 1 hour hard limit

export async function createSession(sessionId: string): Promise<Session> {
  console.log(`[${sessionId}] Creating sandbox...`)

  const sandbox = await Sandbox.create({
    timeoutMs: MAX_SESSION_MS,
  })

  // Upload and run setup script
  console.log(`[${sessionId}] Running setup script...`)
  const fs = await import('fs')
  const path = await import('path')
  // Works regardless of whether running via ts-node-dev or compiled dist/
  const candidates = [
    path.resolve(__dirname, '../../setup.sh'),   // ts-node-dev: src/ → root
    path.resolve(__dirname, '../setup.sh'),       // compiled: dist/ → root
    path.resolve(process.cwd(), 'setup.sh'),      // fallback: cwd
  ]
  const setupPath = candidates.find(p => fs.existsSync(p))
  if (!setupPath) throw new Error('setup.sh not found — checked: ' + candidates.join(', '))
  const setupScript = fs.readFileSync(setupPath, 'utf-8')
  await sandbox.files.write('/setup.sh', setupScript)

  const setupResult = await sandbox.commands.run('bash /setup.sh', {
    timeoutMs: 5 * 60 * 1000, // 5 min to set up
    onStdout: (data) => console.log(`[setup] ${data}`),
    onStderr: (data) => console.error(`[setup:err] ${data}`),
  })

  if (setupResult.exitCode !== 0) {
    await sandbox.kill()
    throw new Error(`Setup failed with exit code ${setupResult.exitCode}`)
  }

  console.log(`[${sessionId}] Setup complete. Getting preview URL...`)

  const host = await sandbox.getHost(3000)
  const previewUrl = `https://${host}`

  // Start Claude Code CLI in interactive mode
  console.log(`[${sessionId}] Starting Claude Code CLI...`)
  const claudeProcess = await sandbox.commands.run(
    'claude --output-format stream-json --verbose',
    {
      cwd: '/workspace',
      envs: {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
      },
      background: true,
    }
  )

  const session: Session = {
    sandbox,
    previewUrl,
    claudeProcess,
    lastActivity: Date.now(),
  }

  sessions.set(sessionId, session)
  return session
}

export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId)
}

export function touchSession(sessionId: string): void {
  const session = sessions.get(sessionId)
  if (session) {
    session.lastActivity = Date.now()
    resetIdleTimer(sessionId, session)
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
  if (!session) return
  if (session.idleTimer) clearTimeout(session.idleTimer)
  try {
    await session.sandbox.kill()
  } catch (err) {
    console.error(`[${sessionId}] Error killing sandbox:`, err)
  }
  sessions.delete(sessionId)
  console.log(`[${sessionId}] Session destroyed`)
}
