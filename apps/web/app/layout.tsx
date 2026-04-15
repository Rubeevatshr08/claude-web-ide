import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'OpenCode Web IDE',
  description: 'Browser-based AI coding environment powered by OpenCode and OpenRouter',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="h-screen overflow-hidden bg-gray-950 text-gray-100">
        {children}
      </body>
    </html>
  )
}
