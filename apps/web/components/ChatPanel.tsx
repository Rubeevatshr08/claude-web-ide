'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  isStreaming?: boolean
}

interface Props {
  onPreviewUrl: (url: string) => void
  onReload: () => void
}

type StatusState = 'connecting' | 'booting' | 'ready' | 'error' | 'thinking'

function generateId() {
  return Math.random().toString(36).slice(2)
}

export default function ChatPanel({ onPreviewUrl, onReload }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<StatusState>('connecting')
  const [statusText, setStatusText] = useState('Connecting...')
  const wsRef = useRef<WebSocket | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const reconnectTimer = useRef<NodeJS.Timeout>()

  const appendOrUpdateAssistant = useCallback((text: string) => {
    setMessages(prev => {
      const last = prev[prev.length - 1]
      if (last?.role === 'assistant') {
        return [
          ...prev.slice(0, -1),
          { ...last, content: last.content + text, isStreaming: true },
        ]
      }
      return [...prev, { id: generateId(), role: 'assistant', content: text, isStreaming: true }]
    })
  }, [])

  const finalizeAssistant = useCallback(() => {
    setMessages(prev => {
      const last = prev[prev.length - 1]
      if (last?.role === 'assistant') {
        return [...prev.slice(0, -1), { ...last, isStreaming: false }]
      }
      return prev
    })
    setStatus('ready')
    setStatusText('Ready')
    // Trigger iframe reload so changes are visible
    onReload()
  }, [onReload])

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8080'
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws
    setStatus('connecting')
    setStatusText('Connecting...')

    ws.onopen = () => {
      setStatus('booting')
      setStatusText('Booting sandbox...')
    }

    ws.onmessage = (event) => {
      let msg: any
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }

      if (msg.type === 'status') {
        setStatusText(msg.message)
      }

      if (msg.type === 'ready') {
        setStatus('ready')
        setStatusText('Ready')
        onPreviewUrl(msg.previewUrl)
        setMessages([{
          id: generateId(),
          role: 'system',
          content: '✅ Sandbox is ready! Describe what you want to build.',
        }])
      }

      if (msg.type === 'claude') {
        const payload = msg.payload
        // stream-json event types: assistant, result, system, tool_use, tool_result
        if (payload.type === 'assistant' && payload.message?.content) {
          for (const block of payload.message.content) {
            if (block.type === 'text' && block.text) {
              setStatus('thinking')
              appendOrUpdateAssistant(block.text)
            }
          }
        }
        if (payload.type === 'result') {
          finalizeAssistant()
        }
      }

      if (msg.type === 'claude_raw') {
        // Raw text fallback — only append if not empty noise
        if (msg.payload?.trim()) {
          appendOrUpdateAssistant(msg.payload)
        }
      }

      if (msg.type === 'error') {
        setStatus('error')
        setStatusText(`Error: ${msg.payload?.slice(0, 80)}`)
      }

      if (msg.type === 'pong') {
        // heartbeat ack — no-op
      }
    }

    ws.onerror = () => {
      setStatus('error')
      setStatusText('Connection error')
    }

   ws.onclose = () => {
  setStatus('error')
  setStatusText('Disconnected — refresh the page to reconnect')
}
  }, [onPreviewUrl, appendOrUpdateAssistant, finalizeAssistant])

  useEffect(() => {
    connect()
    // Heartbeat
    const heartbeat = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }))
      }
    }, 30_000)
    return () => {
      clearInterval(heartbeat)
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = () => {
    const text = input.trim()
    if (!text || wsRef.current?.readyState !== WebSocket.OPEN || status === 'booting') return

    setMessages(prev => [...prev, { id: generateId(), role: 'user', content: text }])
    wsRef.current.send(JSON.stringify({ type: 'user_message', content: text }))
    setInput('')
    setStatus('thinking')
    setStatusText('Claude is working...')
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const statusColor: Record<StatusState, string> = {
    connecting: 'text-yellow-400',
    booting: 'text-orange-400',
    ready: 'text-green-400',
    error: 'text-red-400',
    thinking: 'text-blue-400',
  }

  const statusDot: Record<StatusState, string> = {
    connecting: 'bg-yellow-400 animate-pulse',
    booting: 'bg-orange-400 animate-pulse',
    ready: 'bg-green-400',
    error: 'bg-red-400',
    thinking: 'bg-blue-400 animate-pulse',
  }

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* Status bar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-800">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot[status]}`} />
        <span className={`text-xs font-mono ${statusColor[status]} truncate`}>{statusText}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center opacity-40 select-none">
            <div className="text-4xl mb-3">⚡</div>
            <p className="text-sm text-gray-400">Starting up your sandbox…</p>
          </div>
        )}

        {messages.map((m) => {
          if (m.role === 'system') {
            return (
              <div key={m.id} className="text-center">
                <span className="text-xs text-gray-500 bg-gray-800 px-3 py-1 rounded-full">
                  {m.content}
                </span>
              </div>
            )
          }

          if (m.role === 'user') {
            return (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[80%] bg-blue-600 text-white px-3 py-2 rounded-2xl rounded-tr-sm text-sm leading-relaxed whitespace-pre-wrap">
                  {m.content}
                </div>
              </div>
            )
          }

          return (
            <div key={m.id} className="flex justify-start">
              <div className="max-w-[90%] bg-gray-800 text-gray-100 px-3 py-2 rounded-2xl rounded-tl-sm text-sm leading-relaxed">
                <ReactMarkdown
                  components={{
                    code({ className, children, ...props }) {
                      const isBlock = className?.includes('language-')
                      return isBlock ? (
                        <pre className="bg-gray-900 rounded p-2 overflow-x-auto my-2 text-xs">
                          <code className={className}>{children}</code>
                        </pre>
                      ) : (
                        <code className="bg-gray-900 px-1 rounded text-xs font-mono" {...props}>
                          {children}
                        </code>
                      )
                    },
                    p({ children }) {
                      return <p className="mb-1 last:mb-0">{children}</p>
                    },
                    ul({ children }) {
                      return <ul className="list-disc list-inside mb-1">{children}</ul>
                    },
                    ol({ children }) {
                      return <ol className="list-decimal list-inside mb-1">{children}</ol>
                    },
                  }}
                >
                  {m.content}
                </ReactMarkdown>
                {m.isStreaming && (
                  <span className="inline-block w-1.5 h-3.5 bg-blue-400 animate-pulse ml-0.5 align-middle rounded-sm" />
                )}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="p-3 border-t border-gray-800 bg-gray-900">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            className="flex-1 bg-gray-800 border border-gray-700 text-gray-100 rounded-xl px-3 py-2 text-sm resize-none placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors min-h-[40px] max-h-[160px]"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              status === 'booting'
                ? 'Waiting for sandbox...'
                : 'Describe what to build... (Enter to send)'
            }
            disabled={status === 'booting' || status === 'connecting'}
            style={{ height: 'auto' }}
            onInput={(e) => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = Math.min(el.scrollHeight, 160) + 'px'
            }}
          />
          <button
            onClick={sendMessage}
            disabled={
              !input.trim() ||
              status === 'booting' ||
              status === 'connecting' ||
              wsRef.current?.readyState !== WebSocket.OPEN
            }
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-gray-600 mt-1.5 px-1">Shift+Enter for new line</p>
      </div>
    </div>
  )
}