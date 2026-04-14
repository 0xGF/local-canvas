import type { WebSocket } from "ws";
import type { WSClientMessage, WSServerMessage, Mutation } from "./types.js";
import { MutationWriter } from "../core/writer/index.js";
import { ComponentScanner } from "../core/scanner/component-scanner.js";
import { AIManager } from "../ai/manager.js";
import { SYSTEM_PROMPT, buildElementContext } from "../ai/prompts/system.js";

const BATCH_WINDOW_MS = 150;

export function createWSHandler(projectRoot: string) {
  const writer = new MutationWriter(projectRoot);
  const scanner = new ComponentScanner(projectRoot);
  const aiManager = new AIManager(projectRoot);

  return function handleConnection(ws: WebSocket) {
    // Per-connection mutation buffer for batching rapid changes
    const mutationBuffer: Map<
      string,
      { mutations: { id: string; mutation: Mutation }[]; timer: ReturnType<typeof setTimeout> }
    > = new Map();

    function flushBuffer(fileKey: string) {
      const entry = mutationBuffer.get(fileKey);
      if (!entry || entry.mutations.length === 0) return;
      mutationBuffer.delete(fileKey);

      const mutations = entry.mutations;

      // Apply all buffered mutations as a batch
      (async () => {
        try {
          const result = await writer.batchApply(mutations.map((m) => m.mutation));
          // Send a single result for the last mutation ID (the "final" one)
          const lastId = mutations[mutations.length - 1].id;
          send(ws, { type: "mutation-result", id: lastId, result });
        } catch (error) {
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
          for (const [key] of mutationBuffer) flushBuffer(key);

          try {
            const result = await writer.undo();
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
          for (const [key] of mutationBuffer) flushBuffer(key);

          try {
            const result = await writer.redo();
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

        case "scan-components": {
          try {
            const result = scanner.scan();
            send(ws, {
              type: "components-scanned",
              components: result.components,
              fileCount: result.fileCount,
            });
          } catch (error) {
            send(ws, { type: "error", message: `Scan failed: ${String(error)}` });
          }
          break;
        }

        case "save": {
          // Flush any pending mutations first
          for (const [key] of mutationBuffer) flushBuffer(key);
          send(ws, { type: "mutation-result" as any, id: "save", result: { success: true, filesModified: [] } });
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
