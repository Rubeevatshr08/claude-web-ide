'use client'
import { useState } from 'react'
import { getApiBaseUrl } from '@/lib/api'

interface Props {
  url: string | null
  reloadKey: number
  sessionId?: string
}

export default function PreviewPanel({ url, reloadKey, sessionId }: Props) {
  const [isLoading, setIsLoading] = useState(false)
  const [isDeploying, setIsDeploying] = useState(false)
  const [deploymentUrl, setDeploymentUrl] = useState<string | null>(null)

  const handleDeploy = async () => {
    if (!sessionId) return
    setIsDeploying(true)
    try {
      const response = await fetch(`${getApiBaseUrl()}/sessions/${encodeURIComponent(sessionId)}/deploy`, {
        method: 'POST',
      })
      const data = await response.json()
      if (response.ok) {
        setDeploymentUrl(data.url)
      } else {
        alert(`Deployment failed: ${data.error}`)
      }
    } catch (err) {
      console.error('Deploy error:', err)
      alert('Failed to deploy. Check console for details.')
    } finally {
      setIsDeploying(false)
    }
  }

  if (!url) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-950 text-gray-500 select-none">
        <div className="text-5xl mb-4 opacity-30">🖥</div>
        <p className="text-sm">Live preview will appear here</p>
        <p className="text-xs text-gray-600 mt-1">Waiting for sandbox to start…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Preview toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 border-b border-gray-800">
        <div className="flex-1 bg-gray-800 rounded px-3 py-1 text-xs text-gray-400 font-mono truncate">
          {url}
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-400 hover:text-gray-200 transition-colors"
          title="Open in new tab"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clipRule="evenodd" />
            <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 00.1.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clipRule="evenodd" />
          </svg>
        </a>
        <button
          onClick={handleDeploy}
          disabled={isDeploying || !sessionId}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-[10px] font-medium transition-colors"
          title="Deploy to Cloudflare for Platforms"
        >
          {isDeploying ? (
            <div className="w-2.5 h-2.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
              <path d="M9.25 13.25a.75.75 0 001.5 0V4.636l2.955 3.129a.75.75 0 001.09-1.03l-4.25-4.5a.75.75 0 00-1.09 0l-4.25 4.5a.75.75 0 101.09 1.03l2.955-3.129v8.614z" />
              <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
            </svg>
          )}
          {isDeploying ? 'Deploying...' : 'Deploy'}
        </button>
        {deploymentUrl && (
          <a
            href={deploymentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-green-400 hover:text-green-300 font-medium underline"
          >
            Deployed!
          </a>
        )}
        {isLoading && (
          <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {/* iframe */}
      <div className="flex-1 relative">
        <iframe
          key={`${url}-${reloadKey}`}
          src={url}
          className="w-full h-full border-0 bg-white"
          title="App Preview"
          onLoad={() => setIsLoading(false)}
          onError={() => setIsLoading(false)}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        />
      </div>
    </div>
  )
}
