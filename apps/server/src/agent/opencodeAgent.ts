import { Sandbox } from "@e2b/code-interpreter";

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_call_id?: string
  tool_calls?: any[]
}

export interface OpenCodeAgentHandlers {
  onStdout?: (data: string) => void | Promise<void>
  onStderr?: (data: string) => void | Promise<void>
}

/**
 * Executes a turn using the OpenCode SDK by communicating with the OpenCode server
 * running inside the E2B sandbox (on port 4096).
 */
export async function runOpenCodeTurnDirect(
  sandbox: Sandbox,
  history: ChatMessage[],
  handlers: OpenCodeAgentHandlers
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const modelName = process.env.OPENROUTER_MODEL || "anthropic/claude-3.5-sonnet";

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  // @ts-ignore - Dynamic import for ESM-only SDK in a CommonJS project
  const { createOpencodeClient } = await import("@opencode-ai/sdk");

  // 1. Connect to the OpenCode server inside the sandbox
  const host = await sandbox.getHost(4096);
  const client = createOpencodeClient({ baseUrl: `https://${host}` });

  // 2. Initialize authentication
  await client.auth.set({
    path: { id: "anthropic" },
    body: { type: "api", key: apiKey },
  });

  // 3. Map history to OpenCode session
  const sessions = await client.session.list();
  let session = sessions.data?.find((s: any) => s.title === "Direct Agent Session");
  
  if (!session) {
    const res = await client.session.create({ body: { title: "Direct Agent Session" } });
    session = res.data;
    
    // Backfill history (excluding the last user message)
    const toBackfill = history.slice(0, -1);
    for (const msg of toBackfill) {
      if (msg.role === 'tool') continue;
      await client.session.prompt({
        path: { id: session!.id },
        body: {
          noReply: true,
          parts: [{ type: "text", text: msg.content || "" }]
        }
      });
    }
  }

  const lastMessage = history[history.length - 1];
  if (!lastMessage || lastMessage.role !== 'user') {
    throw new Error("Last message in history must be a user prompt");
  }

  let finalResponse = "";
  const editedFiles = new Set<string>();

  // 4. Subscribe to events for streaming
  const events = await client.event.subscribe();

  // 5. Trigger the prompt
  const promptPromise = client.session.prompt({
    path: { id: session!.id },
    body: {
      parts: [{ type: "text", text: lastMessage.content || "" }],
      model: { providerID: "anthropic", modelID: modelName }
    }
  });

  // 6. Loop through events and pipe to handlers
  for await (const event of (events as any).stream) {
    if (event.type === 'message.part.updated') {
      const part = event.properties.part;
      const delta = event.properties.delta;
      
      if (part.type === 'text' && delta) {
        finalResponse += delta;
        await handlers.onStdout?.(JSON.stringify({ 
          type: 'assistant', 
          message: { content: [{ type: 'text', text: delta }] } 
        }) + '\n');
      } else if (part.type === 'tool' && part.state.status === 'running') {
        await handlers.onStdout?.(JSON.stringify({ 
          type: 'status', 
          message: `Using tool: ${part.tool}...` 
        }) + '\n');
      }
    } else if (event.type === 'file.edited') {
      const filePath = event.properties.file;
      editedFiles.add(filePath);
      await handlers.onStdout?.(JSON.stringify({ 
        type: 'file_changed', 
        path: filePath 
      }) + '\n');
    } else if (event.type === 'session.idle') {
      break;
    }
  }

  await promptPromise;

  // HMR Stabilization Hook (Run inside sandbox)
  if (editedFiles.size > 0) {
    const filesArray = Array.from(editedFiles);
    // 1. Force Next.js HMR to pick up the change
    await sandbox.commands.run(`touch ${filesArray.map(f => `"${f}"`).join(' ')}`);
    
    // 2. Duplicate Removal
    for (const file of filesArray) {
      if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        const base = file.replace(/\.tsx?$|\.jsx?$/, '');
        await sandbox.commands.run(`rm -f "${base}.js" "${base}.jsx" 2>/dev/null || true`);
      }
    }
    
    // 3. Clear cache if many files changed
    if (editedFiles.size > 3) {
      await sandbox.commands.run(`rm -rf .next/cache 2>/dev/null || true`);
    }
  }

  return finalResponse;
}
