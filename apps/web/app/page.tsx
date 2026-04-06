'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getApiBaseUrl, SessionSummary } from '@/lib/api'

export default function Home() {
  const router = useRouter()
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSessions = useCallback(async () => {
    const response = await fetch(`${getApiBaseUrl()}/sessions`, { cache: 'no-store' })
    if (!response.ok) throw new Error('Failed to load sessions')
    const data = await response.json()
    setSessions(data)
  }, [])

  useEffect(() => {
    void loadSessions().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load sessions'))
  }, [loadSessions])

  const createSession = useCallback(async () => {
    setIsCreating(true)
    setError(null)
    try {
      const response = await fetch(`${getApiBaseUrl()}/sessions`, {
        method: 'POST',
      })
      if (!response.ok) throw new Error('Failed to create session')
      const data = await response.json()
      router.push(`/projects/${data.sessionId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session')
      setIsCreating(false)
    }
  }, [router])

  const destroySession = useCallback(async (sessionId: string) => {
    const response = await fetch(`${getApiBaseUrl()}/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    })
    if (!response.ok && response.status !== 204) throw new Error('Failed to destroy session')
    await loadSessions()
  }, [loadSessions])

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Claude Web IDE</h1>
            <p className="mt-2 text-sm text-gray-400">Create a sandbox once, then reconnect to it from its project URL.</p>
          </div>
          <button
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isCreating}
            onClick={() => void createSession()}
            type="button"
          >
            {isCreating ? 'Creating...' : 'New Session'}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
          <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_180px] gap-4 border-b border-gray-800 px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-500">
            <div>Session</div>
            <div>Created</div>
            <div>Actions</div>
          </div>

          {sessions.length === 0 ? (
            <div className="px-4 py-10 text-sm text-gray-400">No active sessions yet.</div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_180px] gap-4 border-b border-gray-800 px-4 py-4 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-sm text-gray-200">{session.id}</div>
                  <div className="mt-1 truncate text-xs text-gray-500">Sandbox: {session.sandboxId}</div>
                </div>
                <div className="text-sm text-gray-400">{new Date(session.createdAt).toLocaleString()}</div>
                <div className="flex items-center gap-2">
                  <button
                    className="rounded border border-gray-700 px-3 py-1.5 text-xs text-gray-200 transition hover:bg-gray-800"
                    onClick={() => router.push(`/projects/${session.id}`)}
                    type="button"
                  >
                    Open
                  </button>
                  <button
                    className="rounded border border-red-900 bg-red-950 px-3 py-1.5 text-xs text-red-300 transition hover:bg-red-900/60"
                    onClick={() => void destroySession(session.id).catch((err) => setError(err instanceof Error ? err.message : 'Failed to destroy session'))}
                    type="button"
                  >
                    Destroy
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
