'use client'
import { useState } from 'react'
import ChatPanel from '@/components/ChatPanel'
import PreviewPanel from '@/components/PreviewPanel'

export default function Home() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewKey, setPreviewKey] = useState(0)

  const handlePreviewUrl = (url: string) => {
    setPreviewUrl(url)
    setPreviewKey(k => k + 1)
  }

  return (
    <div className="flex h-screen bg-gray-950">
      {/* Header bar */}
      <div className="fixed top-0 left-0 right-0 h-10 bg-gray-900 border-b border-gray-800 flex items-center px-4 z-10">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-orange-400" />
          <span className="text-sm font-semibold text-gray-200 tracking-tight">Claude Web IDE</span>
        </div>
      </div>

      <div className="flex w-full pt-10 h-screen">
        {/* Left: Chat */}
        <div className="w-[420px] flex-shrink-0 border-r border-gray-800 flex flex-col">
          <ChatPanel
            onPreviewUrl={handlePreviewUrl}
            onReload={() => setPreviewKey(k => k + 1)}
          />
        </div>

        {/* Right: Preview */}
        <div className="flex-1 flex flex-col min-w-0">
          <PreviewPanel url={previewUrl} reloadKey={previewKey} />
        </div>
      </div>
    </div>
  )
}
