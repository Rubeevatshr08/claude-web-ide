export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_WS_URL?.replace(/^ws/i, 'http') ?? 'http://localhost:8080'
}

export interface SessionSummary {
  id: string
  sandboxId: string
  previewUrl: string
  createdAt: string
  updatedAt: string
  status: 'active' | 'destroyed'
}
