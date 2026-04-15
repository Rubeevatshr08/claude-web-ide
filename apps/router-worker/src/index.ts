interface Env {
  DISPATCHER: DispatchNamespace
  WORKER_PREFIX: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Extract scriptId from subdomain
    // e.g. "abc123.somedomain.com" → "abc123"
    const host = url.hostname                  // "abc123.somedomain.com"
    const scriptId = host.split('.')[0]        // "abc123"

    if (!scriptId || scriptId === 'opencode-ide-router') {
      return new Response('Missing or invalid session ID in subdomain', { status: 400 })
    }

    const workerName = `${env.WORKER_PREFIX}${scriptId.toLowerCase()}`

    try {
      const worker = env.DISPATCHER.get(workerName)
      return await worker.fetch(request)
    } catch (e: any) {
      if (e.message?.includes('Worker not found')) {
        return new Response(
          JSON.stringify({ error: `No worker deployed for session: ${scriptId}` }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        )
      }
      console.error(`Router error for ${scriptId}:`, e)
      return new Response(
        JSON.stringify({ error: 'Router internal error' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      )
    }
  }
}
