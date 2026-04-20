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
        selector: {
          type: "string",
          description: "CSS selector to find the element",
        },
        filePath: {
          type: "string",
          description: "Source file path (alternative to selector)",
        },
        line: {
          type: "number",
          description: "Line number in source file",
        },
      },
    },
  },
  {
    name: "canvas_modify_classes",
    description:
      "Add or remove Tailwind CSS classes from the selected element",
    inputSchema: {
      type: "object" as const,
      properties: {
        filePath: {
          type: "string",
          description: "Source file path",
        },
        line: {
          type: "number",
          description: "Line number of the element",
        },
        add: {
          type: "array",
          items: { type: "string" },
          description: "Classes to add",
        },
        remove: {
          type: "array",
          items: { type: "string" },
          description: "Classes to remove",
        },
      },
      required: ["filePath", "line"],
    },
  },
  {
    name: "canvas_insert_component",
    description:
      "Insert a new component into the page at a specific location",
    inputSchema: {
      type: "object" as const,
      properties: {
        filePath: {
          type: "string",
          description: "Source file path of the target element",
        },
        line: {
          type: "number",
          description: "Line number of the target element",
        },
        position: {
          type: "string",
          enum: ["before", "after", "child"],
          description: "Where to insert relative to target",
        },
        componentName: {
          type: "string",
          description: "Name of the component to insert (e.g., Button, Card)",
        },
        props: {
          type: "object",
          description: "Props to pass to the component",
        },
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
        filePath: {
          type: "string",
          description: "Source file path of the parent element",
        },
        line: {
          type: "number",
          description: "Line number of the parent element",
        },
        fromIndex: {
          type: "number",
          description: "Index of child to move",
        },
        toIndex: {
          type: "number",
          description: "Target index position",
        },
      },
      required: ["filePath", "line", "fromIndex", "toIndex"],
    },
  },
  {
    name: "canvas_get_page_info",
    description:
      "Get information about the current page structure and elements",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
];

export async function startMCPServer(canvasPort = 6966) {
  const server = new Server(
    {
      name: "local-canvas",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: CANVAS_TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const result = await sendToCanvas(canvasPort, name, args || {});
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [
          { type: "text" as const, text: `Error: ${String(error)}` },
        ],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function sendToCanvas(
  port: number,
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/__canvas/ws`);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("Canvas editor connection timeout"));
    }, 10000);

    ws.on("open", () => {
      // Map MCP tool to canvas mutation
      const mutation = mapToolToMutation(toolName, args);
      if (!mutation) {
        clearTimeout(timeout);
        ws.close();
        reject(new Error(`Unknown tool: ${toolName}`));
        return;
      }

      ws.send(
        JSON.stringify({
          type: "mutation",
          id: `mcp-${Date.now()}`,
          mutation,
        })
      );
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

    ws.on("error", (err) => {
      clearTimeout(timeout);
      reject(
        new Error(
          `Cannot connect to canvas editor on port ${port}. Is it running?`
        )
      );
    });
  });
}

function mapToolToMutation(
  toolName: string,
  args: Record<string, unknown>
) {
  switch (toolName) {
    case "canvas_modify_classes":
      return {
        type: "modify-class",
        source: {
          filePath: args.filePath as string,
          line: args.line as number,
        },
        add: args.add as string[] | undefined,
        remove: args.remove as string[] | undefined,
      };

    case "canvas_insert_component":
      return {
        type: "insert",
        source: {
          filePath: args.filePath as string,
          line: args.line as number,
        },
        position: args.position as string,
        componentName: args.componentName as string,
        props: args.props as Record<string, string> | undefined,
      };

    case "canvas_reorder":
      return {
        type: "reorder",
        source: {
          filePath: args.filePath as string,
          line: args.line as number,
        },
        fromIndex: args.fromIndex as number,
        toIndex: args.toIndex as number,
      };

    default:
      return null;
  }
}

// Run if executed directly
const isMainModule =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("server.js") ||
    process.argv[1].endsWith("server.ts"));

if (isMainModule) {
  startMCPServer().catch(console.error);
}
