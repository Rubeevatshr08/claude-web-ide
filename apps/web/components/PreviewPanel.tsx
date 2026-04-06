'use client'
import { useState } from 'react'

interface Props {
  url: string | null
  reloadKey: number
}

export default function PreviewPanel({ url, reloadKey }: Props) {
  const [isLoading, setIsLoading] = useState(false)

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
            <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clipRule="evenodd" />
          </svg>
        </a>
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
