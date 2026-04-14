import { CodeBlock } from "../components/CodeBlock";

export default function MCP() {
  return (
    <div className="max-w-[680px] px-6 pt-12 pb-16 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-3">MCP Server</h1>
        <p className="text-[15px] text-neutral-500 leading-relaxed">
          Canvas Editor exposes a Model Context Protocol server so AI tools can
          interact with the editor programmatically.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Overview</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          The MCP server connects to the canvas editor's WebSocket and exposes
          tools that map to source code mutations. This lets Claude Code (or any
          MCP-compatible client) select elements, modify classes, insert
          components, and reorder children — all through the same mutation
          pipeline that the visual editor uses.
        </p>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          Each tool call creates a WebSocket connection to{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">localhost:3001</code>{" "}
          (or your configured proxy port), sends the mutation, and waits up to
          10 seconds for a{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">mutation-result</code>{" "}
          response.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-6">
        <h2 className="text-lg font-semibold tracking-tight">Available tools</h2>

        <div className="space-y-4">
          <h3 className="text-[14px] font-semibold text-neutral-800">
            <code className="font-mono">canvas_select_element</code>
          </h3>
          <p className="text-[14px] text-neutral-600 leading-relaxed">
            Select an element by CSS selector or by file path + line number.
          </p>
          <CodeBlock
            code={`{
  selector: "div.card",   // CSS selector
  // or
  filePath: "src/App.tsx",
  line: 42
}`}
          />
        </div>

        <div className="space-y-4">
          <h3 className="text-[14px] font-semibold text-neutral-800">
            <code className="font-mono">canvas_modify_classes</code>
          </h3>
          <p className="text-[14px] text-neutral-600 leading-relaxed">
            Add or remove Tailwind classes on an element.
          </p>
          <CodeBlock
            code={`{
  filePath: "src/components/Card.tsx",
  line: 12,
  add: ["p-6", "shadow-lg"],
  remove: ["p-4"]
}`}
          />
        </div>

        <div className="space-y-4">
          <h3 className="text-[14px] font-semibold text-neutral-800">
            <code className="font-mono">canvas_insert_component</code>
          </h3>
          <p className="text-[14px] text-neutral-600 leading-relaxed">
            Insert a component before, after, or as a child of a target element.
          </p>
          <CodeBlock
            code={`{
  filePath: "src/App.tsx",
  line: 25,
  position: "child",      // "before" | "after" | "child"
  componentName: "Badge",
  props: { variant: "secondary" }
}`}
          />
        </div>

        <div className="space-y-4">
          <h3 className="text-[14px] font-semibold text-neutral-800">
            <code className="font-mono">canvas_reorder</code>
          </h3>
          <p className="text-[14px] text-neutral-600 leading-relaxed">
            Reorder children within a parent element.
          </p>
          <CodeBlock
            code={`{
  filePath: "src/App.tsx",
  line: 18,
  fromIndex: 0,
  toIndex: 2
}`}
          />
        </div>

        <div className="space-y-4">
          <h3 className="text-[14px] font-semibold text-neutral-800">
            <code className="font-mono">canvas_get_page_info</code>
          </h3>
          <p className="text-[14px] text-neutral-600 leading-relaxed">
            Returns information about the current page and selected element.
            No parameters required.
          </p>
        </div>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Usage with Claude Code</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          The MCP server is built with{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">@modelcontextprotocol/sdk</code>.
          Point your MCP client at the canvas editor's endpoint to give Claude Code
          the ability to visually edit your running app.
        </p>
        <p className="text-[14px] text-neutral-600 leading-relaxed">What this enables:</p>
        <ul className="list-disc pl-5 text-[14px] text-neutral-600 space-y-1 leading-relaxed">
          <li>Select elements and modify their Tailwind classes</li>
          <li>Insert new components at specific locations</li>
          <li>Reorder elements within parent containers</li>
          <li>Shared mutation pipeline — undo/redo works across visual edits and MCP calls</li>
        </ul>
      </div>
    </div>
  );
}
