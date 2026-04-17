import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const app = express();
const PORT = 8000;
app.use(express.json());

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_call_id?: string
  tool_calls?: any[]
}

// Singleton Initialization State
let initPromise: Promise<any> | null = null;
let opencodeInstance: any = null;

/**
 * Strictly serialized OpenCode initialization.
 * Ensures only ONE server is ever started, preventing Port 4096 conflicts.
 */
async function getOpencode() {
  if (opencodeInstance) return opencodeInstance;

  if (!initPromise) {
    initPromise = (async () => {
      console.log("Starting singleton OpenCode initialization...");
      try {
        // @ts-ignore
        const { createOpencode } = await import("@opencode-ai/sdk");
        
        // Initial attempt to start the server
        const instance = await createOpencode({
          hostname: "127.0.0.1",
          port: 4096,
          config: {
            model: process.env.OPENROUTER_MODEL || "anthropic/claude-3.5-sonnet",
          }
        });

        const apiKey = process.env.OPENROUTER_API_KEY;
        if (apiKey && instance) {
          await instance.client.auth.set({
            path: { id: "anthropic" },
            body: { type: "api", key: apiKey },
          });
        }

        opencodeInstance = instance;
        console.log("OpenCode Singleton Ready.");
        return instance;
      } catch (err) {
        console.error("OpenCode initialization failed:", err);
        initPromise = null; // Allow retry on next request if it totally failed to start
        throw err;
      }
    })();
  }

  // Wait for the ongoing initialization to finish
  const instance = await initPromise;
  
  // Final sanity check: if the promise resolved but didn't set the instance
  if (!opencodeInstance) {
    opencodeInstance = instance;
  }
  
  return opencodeInstance;
}

// Pre-warm the engine on boot
getOpencode().catch(err => console.error("Boot-time pre-warm failed (will retry on first request):", err));

app.post('/task', async (req: express.Request, res: express.Response) => {
  const { history } = req.body;
  res.setHeader('Content-Type', 'application/x-ndjson');
  
  try {
    const { client } = await getOpencode();
    const sessions = await client.session.list();
    let session = sessions.data?.find((s: any) => s.title === "OpenCode IDE Session");
    
    if (!session) {
      const resp = await client.session.create({ body: { title: "OpenCode IDE Session" } });
      session = resp.data;
      
      const toBackfill = history.slice(0, -1);
      for (const msg of toBackfill as ChatMessage[]) {
        if (msg.role === 'tool') continue;
        await client.session.prompt({
          path: { id: session.id },
          body: {
            noReply: true,
            parts: [{ type: "text", text: msg.content || "" }]
          }
        });
      }
    }

    const lastMessage = history[history.length - 1];
    const events = await client.event.subscribe();
    
    const promptPromise = client.session.prompt({
      path: { id: session.id },
      body: {
        parts: [{ type: "text", text: lastMessage.content || "" }]
      }
    });

    let fullAssistantContent = "";
    const editedFiles = new Set<string>();
    
    for await (const event of (events as any).stream) {
      if (event.type === 'message.part.updated') {
        const part = event.properties.part;
        const delta = event.properties.delta;

        if (part.type === 'text' && delta) {
          fullAssistantContent += delta;
          res.write(JSON.stringify({ type: 'assistant', chunk: delta }) + '\n');
        } else if (part.type === 'tool' && part.state.status === 'running') {
          res.write(JSON.stringify({ type: 'status', message: `Using tool: ${part.tool}...` }) + '\n');
        }
      } else if (event.type === 'file.edited') {
        editedFiles.add(event.properties.file);
        res.write(JSON.stringify({ type: 'file_changed', path: event.properties.file }) + '\n');
      } else if (event.type === 'command.executed') {
        res.write(JSON.stringify({ type: 'status', message: `Executed: ${event.properties.name}` }) + '\n');
      } else if (event.type === 'session.idle') {
        break;
      }
    }

    await promptPromise;

    if (editedFiles.size > 0) {
      for (const file of editedFiles) {
        try {
          await execAsync(`touch "${file}"`);
          if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            const base = file.replace(/\.tsx?$|\.jsx?$/, '');
            await execAsync(`rm -f "${base}.js" "${base}.jsx" 2>/dev/null || true`);
          }
        } catch (err) {}
      }
      await execAsync(`rm -rf .next/cache 2>/dev/null || true`);
    }

    res.write(JSON.stringify({ type: 'result', content: fullAssistantContent }) + '\n');
    
  } catch (err: any) {
    console.error("Orchestrator Error:", err);
    res.write(JSON.stringify({ type: 'error', message: err.message }) + '\n');
  } finally {
    res.end();
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Orchestrator listening on port ${PORT}`);
});
