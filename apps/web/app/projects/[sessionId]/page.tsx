'use client'

import { use, useCallback, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import ChatPanel from '@/components/ChatPanel'
import PreviewPanel from '@/components/PreviewPanel'
import { getApiBaseUrl } from '@/lib/api'

export default function ProjectPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = use(params)
  const router = useRouter()
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewKey, setPreviewKey] = useState(0)
  const [isDestroying, setIsDestroying] = useState(false)
  const [isValidating, setIsValidating] = useState(true)

  // Pre-flight check: Ensure session exists in DB before showing the UI
  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/sessions/${encodeURIComponent(sessionId)}/exists`)
        const data = await response.json()
        if (!data.exists) {
          router.push('/')
        } else {
          if (data.previewUrl) {
            setPreviewUrl(data.previewUrl)
          }
          setIsValidating(false)
        }
      } catch (err) {
        console.error('Session validation failed:', err)
        setIsValidating(false)
      }
    }
    checkSession()
  }, [sessionId, router])

  const handlePreviewUrl = useCallback((url: string) => {
    setPreviewUrl(url)
    setPreviewKey((k) => k + 1)
  }, [])

  const handleReload = useCallback(() => {
    setPreviewKey((k) => k + 1)
  }, [])

  const handleDestroy = useCallback(async () => {
    const response = await fetch(`${getApiBaseUrl()}/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    })

    if (!response.ok && response.status !== 204) {
      throw new Error('Failed to destroy session')
    }
  }, [sessionId])

  if (isValidating) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950 text-gray-400">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-mono tracking-widest uppercase">Validating Session...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gray-950">
      <div className="fixed top-0 left-0 right-0 h-10 bg-gray-900 border-b border-gray-800 flex items-center px-4 z-10">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-400" />
          <span className="text-sm font-semibold text-gray-200 tracking-tight">OpenCode Web IDE</span>
        </div>
        <div className="ml-auto text-xs font-mono text-gray-500">
          /projects/{sessionId || '...'}
        </div>
        <button
          className="ml-4 rounded border border-red-900 bg-red-950 px-2 py-1 text-xs font-medium text-red-300 transition hover:bg-red-900/60 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isDestroying}
          onClick={async () => {
            if (!sessionId || isDestroying) return
            setIsDestroying(true)
            try {
              await handleDestroy()
              router.push('/')
            } catch (err) {
              console.error('Failed to destroy session:', err)
              setIsDestroying(false)
            }
          }}
          type="button"
        >
          {isDestroying ? 'Destroying...' : 'Destroy Session'}
        </button>
      </div>

      <div className="flex w-full pt-10 h-screen">
        <div className="w-[420px] flex-shrink-0 border-r border-gray-800 flex flex-col">
          <ChatPanel
            sessionId={sessionId}
            onPreviewUrl={handlePreviewUrl}
            onReload={handleReload}
          />
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <PreviewPanel url={previewUrl} reloadKey={previewKey} sessionId={sessionId} />
        </div>
      </div>
    </div>
  )
}
