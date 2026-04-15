import { Sandbox } from "@e2b/code-interpreter";
import path from "path";

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

export async function runOpenCodeTurnDirect(
  sandbox: Sandbox,
  history: ChatMessage[],
  handlers: OpenCodeAgentHandlers
): Promise<string> {
  const modelName = process.env.OPENROUTER_MODEL || "anthropic/claude-3.5-sonnet";
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  const systemPrompt = `You are OpenCode, an expert software engineer AI agent. Help the user build, preview, and deploy high-quality web applications. 

Key responsibilities:
1. Use the provided tools to read/write files and run bash commands.
2. The workspace is located at /home/user/workspace.
3. 🚨 CRITICAL: When using 'overwrite_entire_file', you MUST provide the FULL PLAIN TEXT source code.
   ❌ NEVER send partial updates or JSON snippets.
   ✅ ALWAYS send a complete, runnable file.
   ✅ Use TypeScript (.tsx/.ts) for all components.
   🚨 NEVER say you have fixed or updated something unless you have called a tool to actually do it. If you don't call a tool, the user sees NOTHING.

Duplicate Protection: If you write a 'pages/index.tsx', make sure to delete 'pages/index.js' if it exists. Next.js will crash if both exist.
   If you see a blank page or a "Duplicate Page" error, you can run 'run_bash' with 'fuser -k 3000/tcp && npm run dev' to force a restart.
4. Always prioritize building modern, responsive, and functional websites.
5. A Next.js development server is ALWAYS running on port 3000. Your changes to pages/ will be visible instantly in the preview.
6. When you are done building, inform the user they can deploy using the 'Deploy to Cloudflare' button in the UI.

Use absolute paths or paths relative to the workspace root. Do NOT hallucinate other tools.`;

  // Aggressively truncate individual message content to avoid token bloat
  const MAX_CONTENT_LENGTH = 50000;
  const processedHistory = history.map(msg => ({
    ...msg,
    content: (msg.content && msg.content.length > MAX_CONTENT_LENGTH)
      ? msg.content.substring(0, MAX_CONTENT_LENGTH) + "... [Content Truncated]"
      : msg.content
  }));

  // Increase history to give more context (last 30 messages)
  const MAX_HISTORY = 30;
  const truncatedHistory = processedHistory.length > MAX_HISTORY 
    ? processedHistory.slice(-MAX_HISTORY) 
    : processedHistory;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...truncatedHistory
  ];

  const tools = [
    {
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Read a file from the workspace.',
        parameters: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Path to the file' }
          },
          required: ['filePath']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'overwrite_entire_file',
        description: 'IMPORTANT: Use this to write the FULL, FINAL content of a file. This tool OVERWRITES the existing file. The content MUST be plain source code. NEVER send a patch, delta, or list of changes.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Absolute or relative path to the file.' },
            content: { type: 'string', description: 'The absolute full source code to write.' }
          },
          required: ['path', 'content']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'run_bash',
        description: 'Run a bash command in the workspace.',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'The bash command to execute' }
          },
          required: ['command']
        }
      }
    }
  ];

  let turnActive = true;
  let finalResponse = "";
  let iterations = 0;
  const MAX_ITERATIONS = 15;

  while (turnActive && iterations < MAX_ITERATIONS) {
    iterations++;
    
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "http://opencode.ai",
        "X-Title": "OpenCode Web IDE",
      },
      body: JSON.stringify({
        model: modelName,
        messages: messages,
        tools: tools,
        tool_choice: 'auto',
        temperature: 0,
        max_tokens: 2048,
        stream: true
      })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("Failed to get response reader");

    let currentAIMessage: ChatMessage = { role: 'assistant', content: "", tool_calls: [] };
    let streamContent = "";

    const decoder = new TextDecoder();
    let streamBuffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      streamBuffer += decoder.decode(value, { stream: true });
      const lines = streamBuffer.split('\n');
      streamBuffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;
        if (!trimmed.startsWith("data: ")) continue;
        
        try {
          const data = JSON.parse(trimmed.slice(6));
          const delta = data.choices[0].delta;

          if (delta.content) {
            streamContent += delta.content;
            currentAIMessage.content = (currentAIMessage.content || "") + delta.content;
            
            // Fix: Send in a format that ChatPanel.tsx expects
            await handlers.onStdout?.(JSON.stringify({ 
              type: 'assistant', 
              message: { content: [{ type: 'text', text: delta.content }] } 
            }) + '\n');
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (!currentAIMessage.tool_calls) currentAIMessage.tool_calls = [];
              const index = tc.index;
              if (!currentAIMessage.tool_calls[index]) {
                currentAIMessage.tool_calls[index] = { ...tc, function: tc.function ? { ...tc.function } : { name: "", arguments: "" } };
              } else {
                if (tc.function?.arguments) {
                  currentAIMessage.tool_calls[index].function.arguments += tc.function.arguments;
                }
                if (tc.function?.name) {
                  currentAIMessage.tool_calls[index].function.name += tc.function.name;
                }
              }
            }
          }
        } catch (e) {
          // Partial line or invalid JSON, will be caught by buffer next time
        }
      }
    }

    messages.push(currentAIMessage);
    finalResponse += streamContent;

    if (currentAIMessage.tool_calls && currentAIMessage.tool_calls.length > 0) {
      // Execute tools
      for (const tc of currentAIMessage.tool_calls) {
        const toolName = tc.function.name;
        const toolArgs = JSON.parse(tc.function.arguments || "{}");
        const toolId = tc.id;

        await handlers.onStdout?.(JSON.stringify({ type: 'status', message: `Using tool: ${toolName}...` }) + '\n');

        let toolResult = "";
        try {
          if (toolName === 'read_file') {
            const filePath = toolArgs.filePath;
            const workspaceBase = process.env.WORKSPACE_PATH || "/home/user/workspace";
            const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(workspaceBase, filePath);
            try {
              toolResult = await sandbox.files.read(absolutePath);
            } catch (err: any) {
              const dir = path.dirname(absolutePath);
              const parentFiles = await sandbox.files.list(dir);
              const fileList = parentFiles.map(f => f.name).join(", ");
              toolResult = `File not found: ${absolutePath}. Files in ${dir}: ${fileList || "none"}`;
            }
          } else if (toolName === 'overwrite_entire_file' || toolName === 'write_file') {
            const filePath = toolArgs.path || toolArgs.filePath;
            let content = toolArgs.content;
            const workspaceBase = process.env.WORKSPACE_PATH || "/home/user/workspace";
            const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(workspaceBase, filePath);
            
            // Rejection Logic: Detect if the AI is sending a 'patch', 'json list', or 'object' instead of full file
            const isObject = typeof content === 'object' && content !== null;
            const contentString = isObject ? JSON.stringify(content, null, 2) : String(content || "");
            const trimmed = contentString.trim();

            const looksLikeData = (trimmed.startsWith('{') || trimmed.startsWith('[')) && 
                                 !trimmed.includes('import ') && 
                                 !trimmed.includes('export ') &&
                                 !trimmed.includes('<');

            if (isObject || looksLikeData) {
               console.warn(`[${sandbox.sandboxId}] Detected invalid format, attempting auto-recovery...`);
               
               // Auto-recovery: If it looks like a style object, wrap it!
               if (isObject && ((content as any).display || (content as any).justifyContent || (content as any).flex)) {
                  content = `import React from 'react';\n\nexport default function Page() {\n  return (\n    <div style={${JSON.stringify(content, null, 2)}}>\n      <h1>Hello World</h1>\n    </div>\n  );\n}`;
               } else {
                  let hint = "You sent a data structure (JSON/Object) instead of plain source code.";
                  if (isObject && (content as any).content) {
                    hint = "It looks like you nested the content inside an object property. Send ONLY the plain text string.";
                  }
                  toolResult = `ERROR: ${hint} You MUST send the FULL file content as a single PLAIN TEXT string (source code). The file was NOT updated. resend the COMPLETE source code for the file now.`;
                  continue; // Skip writing, let the agent try again in next turn
               }
            }

            try {
              const workspaceBase = process.env.WORKSPACE_PATH || "/home/user/workspace";
              const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(workspaceBase, filePath);
              
              // Duplicate Cleanup Logic: remove conflicting extensions
              const dirname = path.dirname(absolutePath);
              const basename = path.basename(absolutePath, path.extname(absolutePath));
              const baseWithDir = path.join(dirname, basename);
              
              // Nuclear Cleanup: remove ALL possible extensions and CLEAR Next.js cache to prevent ghosting
              await sandbox.commands.run(`rm -f ${baseWithDir}.js ${baseWithDir}.jsx ${baseWithDir}.tsx ${baseWithDir}.ts && rm -rf .next/cache`, { cwd: workspaceBase });

              await sandbox.files.write(absolutePath, content);
              
              // Force Next.js HMR to wake up
              await sandbox.commands.run(`touch ${absolutePath}`, { cwd: workspaceBase });

              // Small delay to let FS events settle
              await new Promise(r => setTimeout(r, 200));
              
              toolResult = `Successfully overwrote ${absolutePath}. All other extensions of this file were deleted to prevent Next.js conflicts.`;
              
              // 🔥 Notify the frontend to refresh the preview
              await handlers.onStdout?.(JSON.stringify({ 
                type: 'file_changed', 
                path: filePath 
              }) + '\n');
            } catch (err: any) {
              toolResult = `Error writing file: ${err.message}`;
            }
          } else if (toolName === 'run_bash') {
            const command = toolArgs.command;
            const longRunning = ["npm run dev", "next dev", "yarn dev", "pnpm dev", "npm start"];
            if (longRunning.some(cmd => command.includes(cmd))) {
              toolResult = "NOTICE: This is a long-running server command. It will run in the background. Check status via preview.";
            } else {
              const result = await sandbox.commands.run(command, {
                cwd: process.env.WORKSPACE_PATH || "/home/user/workspace",
              });
              toolResult = `Stdout: ${result.stdout}\nStderr: ${result.stderr}\nExit Code: ${result.exitCode}`;
            }
          }
        } catch (err: any) {
          toolResult = `Error executing tool: ${err.message}`;
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolId,
          content: toolResult
        });
      }
    } else {
      turnActive = false;
    }
  }

  return finalResponse;
}
