import type { WebSocket } from "ws";
import type { WSClientMessage, WSServerMessage, Mutation } from "./types.js";
import { MutationWriter } from "../core/writer/index.js";
import { AIManager } from "../ai/manager.js";
import { SYSTEM_PROMPT, buildElementContext } from "../ai/prompts/system.js";

const BATCH_WINDOW_MS = 150;

export function createWSHandler(projectRoot: string) {
  const writer = new MutationWriter(projectRoot);
  const aiManager = new AIManager(projectRoot);

  return function handleConnection(ws: WebSocket) {
    // Per-connection mutation buffer for batching rapid changes
    const mutationBuffer: Map<
      string,
      { mutations: { id: string; mutation: Mutation }[]; timer: ReturnType<typeof setTimeout> }
    > = new Map();

    /** Flush every pending file buffer and wait for all writes to settle. */
    function flushAllBuffers(): Promise<void[]> {
      const pending: Promise<void>[] = [];
      for (const [key] of mutationBuffer) pending.push(flushBuffer(key));
      return Promise.all(pending);
    }

    function flushBuffer(fileKey: string): Promise<void> {
      const entry = mutationBuffer.get(fileKey);
      if (!entry || entry.mutations.length === 0) return Promise.resolve();
      mutationBuffer.delete(fileKey);

      const mutations = entry.mutations;

      return (async () => {
        try {
          const result = await writer.batchApply(mutations.map((m) => m.mutation));
          const lastId = mutations[mutations.length - 1].id;
          if (result.success) {
            console.log(`[local-canvas] ✓ Applied ${mutations.length} mutation(s) to ${mutations[0].mutation.source.filePath}:${mutations[0].mutation.source.line}${result.diff ? ` — ${result.diff.split('\n')[0]}` : ''}`);
          } else {
            console.error(`[local-canvas] ✗ Mutation failed: ${result.error}`);
          }
          send(ws, { type: "mutation-result", id: lastId, result });
        } catch (error) {
          console.error(`[local-canvas] ✗ Mutation error: ${error}`);
          const lastId = mutations[mutations.length - 1].id;
          send(ws, {
            type: "mutation-result",
            id: lastId,
            result: { success: false, error: String(error), filesModified: [] },
          });
        }
      })();
    }

    ws.on("message", async (data) => {
      let message: WSClientMessage;
      try {
        message = JSON.parse(data.toString());
      } catch {
        send(ws, { type: "error", message: "Invalid JSON" });
        return;
      }

      switch (message.type) {
        case "mutation": {
          const fileKey = message.mutation.source.filePath + ":" + message.mutation.source.line;

          let entry = mutationBuffer.get(fileKey);
          if (!entry) {
            entry = { mutations: [], timer: setTimeout(() => flushBuffer(fileKey), BATCH_WINDOW_MS) };
            mutationBuffer.set(fileKey, entry);
          } else {
            // Reset the timer — extend the batch window
            clearTimeout(entry.timer);
            entry.timer = setTimeout(() => flushBuffer(fileKey), BATCH_WINDOW_MS);
          }

          entry.mutations.push({ id: message.id, mutation: message.mutation });
          break;
        }

        case "undo": {
          // Flush all pending mutations before undo
          await flushAllBuffers();

          try {
            const result = await writer.undo();
            console.log(`[local-canvas] ↩ Undo: ${result.success ? 'ok' : result.error}`);
            send(ws, {
              type: "mutation-result",
              id: "undo",
              result,
            });
          } catch (error) {
            send(ws, { type: "error", message: String(error) });
          }
          break;
        }

        case "redo": {
          await flushAllBuffers();

          try {
            const result = await writer.redo();
            console.log(`[local-canvas] ↪ Redo: ${result.success ? 'ok' : result.error}`);
            send(ws, {
              type: "mutation-result",
              id: "redo",
              result,
            });
          } catch (error) {
            send(ws, { type: "error", message: String(error) });
          }
          break;
        }

        case "ai-command": {
          const provider = aiManager.getProvider();
          if (!provider) {
            send(ws, {
              type: "ai-stream",
              chunk:
                "No AI provider configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY, or create a .local-canvas.json config file.",
              done: true,
            });
            break;
          }

          try {
            const context = buildElementContext(message.elementContext);
            const messages = [
              { role: "system" as const, content: SYSTEM_PROMPT },
              {
                role: "user" as const,
                content: `Element context:\n${context}\n\nRequest: ${message.prompt}`,
              },
            ];

            let fullResponse = "";
            for await (const chunk of provider.chat(messages)) {
              fullResponse += chunk;
              send(ws, { type: "ai-stream", chunk, done: false });
            }
            send(ws, { type: "ai-stream", chunk: "", done: true });

            // Try to parse and apply the AI response
            try {
              const parsed = JSON.parse(fullResponse);
              if (parsed.add || parsed.remove) {
                const result = await writer.apply({
                  type: "modify-class",
                  source: {
                    filePath: message.elementContext.filePath,
                    line: message.elementContext.line,
                    column: message.elementContext.column,
                  },
                  add: parsed.add,
                  remove: parsed.remove,
                });
                send(ws, {
                  type: "mutation-result",
                  id: "ai",
                  result,
                });
              }
            } catch {
              // Response wasn't parseable JSON — that's ok, it was shown to user
            }
          } catch (error) {
            send(ws, {
              type: "ai-stream",
              chunk: `Error: ${String(error)}`,
              done: true,
            });
          }
          break;
        }

        case "get-completions": {
          send(ws, { type: "completions", items: [] });
          break;
        }

        case "save": {
          // Flush any pending mutations and wait for them to complete
          const flushed = await flushAllBuffers();
          console.log(`[local-canvas] 💾 Save (flushed ${flushed.length} pending buffers)`);
          send(ws, { type: "mutation-result", id: "save", result: { success: true, filesModified: [] } });
          break;
        }
      }
    });

    ws.on("close", () => {
      // Clean up timers
      for (const [, entry] of mutationBuffer) clearTimeout(entry.timer);
      mutationBuffer.clear();
    });

    ws.on("error", (error) => {
      console.error("[local-canvas] WebSocket error:", error.message);
    });
  };
}

function send(ws: WebSocket, message: WSServerMessage) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}
