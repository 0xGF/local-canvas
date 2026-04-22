import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { WebSocket } from "ws";

const CANVAS_TOOLS = [
  {
    name: "canvas_select_element",
    description:
      "Select an element in the canvas editor by CSS selector or source location",
    inputSchema: {
      type: "object" as const,
      properties: {
        selector: { type: "string", description: "CSS selector to find the element" },
        filePath: { type: "string", description: "Source file path (alternative to selector)" },
        line: { type: "number", description: "Line number in source file" },
      },
    },
  },
  {
    name: "canvas_modify_classes",
    description: "Add or remove Tailwind CSS classes from the selected element",
    inputSchema: {
      type: "object" as const,
      properties: {
        filePath: { type: "string", description: "Source file path" },
        line: { type: "number", description: "Line number of the element" },
        add: { type: "array", items: { type: "string" }, description: "Classes to add" },
        remove: { type: "array", items: { type: "string" }, description: "Classes to remove" },
      },
      required: ["filePath", "line"],
    },
  },
  {
    name: "canvas_insert_component",
    description: "Insert a new component into the page at a specific location",
    inputSchema: {
      type: "object" as const,
      properties: {
        filePath: { type: "string", description: "Source file path of the target element" },
        line: { type: "number", description: "Line number of the target element" },
        position: { type: "string", enum: ["before", "after", "child"], description: "Where to insert relative to target" },
        componentName: { type: "string", description: "Name of the component to insert (e.g., Button, Card)" },
        props: { type: "object", description: "Props to pass to the component" },
      },
      required: ["filePath", "line", "position", "componentName"],
    },
  },
  {
    name: "canvas_reorder",
    description: "Reorder children of a JSX element",
    inputSchema: {
      type: "object" as const,
      properties: {
        filePath: { type: "string", description: "Source file path of the parent element" },
        line: { type: "number", description: "Line number of the parent element" },
        fromIndex: { type: "number", description: "Index of child to move" },
        toIndex: { type: "number", description: "Target index position" },
      },
      required: ["filePath", "line", "fromIndex", "toIndex"],
    },
  },
  {
    name: "canvas_get_page_info",
    description: "Get information about the current page structure and elements",
    inputSchema: { type: "object" as const, properties: {} },
  },
];

const ANNOTATION_TOOLS = [
  {
    name: "annotations_list_pending",
    description:
      "List pending 'Ask AI' annotations the user has posted in the local-canvas overlay. Each entry includes the user's comment, the target file:line (elementPath), and any prior thread. Poll this to pick up work.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "annotations_list",
    description:
      "List annotations with optional status filter. status can be 'pending' | 'resolved' | 'dismissed'. Omit to return all.",
    inputSchema: {
      type: "object" as const,
      properties: {
        status: { type: "string", enum: ["pending", "resolved", "dismissed"] },
        url: { type: "string", description: "Filter to annotations posted on this URL" },
      },
    },
  },
  {
    name: "annotations_get",
    description: "Fetch a single annotation by id, including its full thread.",
    inputSchema: {
      type: "object" as const,
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "annotations_acknowledge",
    description:
      "Mark an annotation as in-progress. Call this as soon as you pick up a pending annotation so the overlay can show the user that work has started (pin pulses blue). Transition pending → in_progress. Follow up with annotations_resolve once the edit is done.",
    inputSchema: {
      type: "object" as const,
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "annotations_request_input",
    description:
      "The user's annotation doesn't have enough detail to act on. Post your clarifying question to the thread AND flip the annotation's status to `needs_input` so the overlay shows an orange pin / chip — the user sees they need to respond before work can continue. Use this instead of annotations_reply whenever you can't make the change without more info from the user.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string" },
        question: { type: "string", description: "Your clarifying question to the user" },
      },
      required: ["id", "question"],
    },
  },
  {
    name: "annotations_reply",
    description:
      "Append a reply from the agent to an annotation's thread. The overlay renders the latest reply inline on each history row. Use this to explain what you did or ask a clarifying question.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string" },
        message: { type: "string", description: "The agent's reply text" },
      },
      required: ["id", "message"],
    },
  },
  {
    name: "annotations_resolve",
    description:
      "Mark an annotation as resolved once the requested change has been made. Optionally provide a summary (1 sentence, past tense — 'Added text-blue-600 to the heading').",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string" },
        summary: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "annotations_dismiss",
    description: "Mark an annotation as dismissed (not going to act on it). Optionally include a reason as a reply first.",
    inputSchema: {
      type: "object" as const,
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
];

const ALL_TOOLS = [...CANVAS_TOOLS, ...ANNOTATION_TOOLS];

export async function startMCPServer(canvasPort = 6966) {
  const server = new Server(
    { name: "local-canvas", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: ALL_TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      if (name.startsWith("annotations_")) {
        const result = await handleAnnotationTool(canvasPort, name, args || {});
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      }
      const result = await sendToCanvas(canvasPort, name, args || {});
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function handleAnnotationTool(
  port: number,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const base = `http://localhost:${port}/__canvas/annotations`;
  const req = async (path: string, init?: RequestInit) => {
    const res = await fetch(`${base}${path}`, init);
    if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text().catch(() => "")}`);
    return res.json();
  };

  switch (name) {
    case "annotations_list_pending":
      return req("/pending");
    case "annotations_list": {
      const params = new URLSearchParams();
      if (args.status) params.set("status", String(args.status));
      if (args.url) params.set("url", String(args.url));
      const qs = params.toString();
      return req(qs ? `?${qs}` : "");
    }
    case "annotations_get":
      return req(`/${encodeURIComponent(String(args.id))}`);
    case "annotations_acknowledge":
      return req(`/${encodeURIComponent(String(args.id))}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "in_progress" }),
      });
    case "annotations_request_input": {
      // Append the agent's question, then flip to needs_input. Two HTTP
      // calls because the thread + status endpoints are separate — doing
      // them in order so the thread entry exists by the time the overlay
      // re-polls and sees the new status.
      const id = encodeURIComponent(String(args.id));
      await req(`/${id}/thread`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "agent", content: String(args.question) }),
      });
      return req(`/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "needs_input" }),
      });
    }
    case "annotations_reply":
      return req(`/${encodeURIComponent(String(args.id))}/thread`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "agent", content: String(args.message) }),
      });
    case "annotations_resolve":
      return req(`/${encodeURIComponent(String(args.id))}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "resolved",
          ...(args.summary ? { resolvedSummary: String(args.summary) } : {}),
        }),
      });
    case "annotations_dismiss":
      return req(`/${encodeURIComponent(String(args.id))}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dismissed" }),
      });
    default:
      throw new Error(`Unknown annotation tool: ${name}`);
  }
}

async function sendToCanvas(
  port: number,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/__canvas/ws`);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("Canvas editor connection timeout"));
    }, 10000);

    ws.on("open", () => {
      const mutation = mapToolToMutation(toolName, args);
      if (!mutation) {
        clearTimeout(timeout);
        ws.close();
        reject(new Error(`Unknown tool: ${toolName}`));
        return;
      }

      ws.send(JSON.stringify({ type: "mutation", id: `mcp-${Date.now()}`, mutation }));
    });

    ws.on("message", (data) => {
      clearTimeout(timeout);
      try {
        const message = JSON.parse(data.toString());
        ws.close();
        resolve(message);
      } catch {
        ws.close();
        reject(new Error("Invalid response from canvas editor"));
      }
    });

    ws.on("error", () => {
      clearTimeout(timeout);
      reject(new Error(`Cannot connect to canvas editor on port ${port}. Is it running?`));
    });
  });
}

function mapToolToMutation(toolName: string, args: Record<string, unknown>) {
  switch (toolName) {
    case "canvas_modify_classes":
      return {
        type: "modify-class",
        source: { filePath: args.filePath as string, line: args.line as number },
        add: args.add as string[] | undefined,
        remove: args.remove as string[] | undefined,
      };
    case "canvas_insert_component":
      return {
        type: "insert",
        source: { filePath: args.filePath as string, line: args.line as number },
        position: args.position as string,
        componentName: args.componentName as string,
        props: args.props as Record<string, string> | undefined,
      };
    case "canvas_reorder":
      return {
        type: "reorder",
        source: { filePath: args.filePath as string, line: args.line as number },
        fromIndex: args.fromIndex as number,
        toIndex: args.toIndex as number,
      };
    default:
      return null;
  }
}

const isMainModule =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("server.js") || process.argv[1].endsWith("server.ts"));

if (isMainModule) {
  startMCPServer().catch(console.error);
}
