import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { CodeBlock } from "../components/CodeBlock";

export default function CLI() {
  return (
    <div className="max-w-[680px] px-6 pt-12 pb-16 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-3">CLI</h1>
        <p className="text-[15px] text-neutral-500 leading-relaxed">
          The <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">local-canvas</code> binary has three subcommands:{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">dev</code> runs the
          editor, <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">init</code>{" "}
          wires up the Babel plugin, and{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">mcp</code> is the
          stdio MCP server your AI agent connects to.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">
          <code className="font-mono">local-canvas dev</code>
        </h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          Start the editor. Proxies all requests to your dev server and injects
          the overlay into HTML responses.
        </p>
        <CodeBlock code="npx local-canvas dev --target 3000" />

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Flag</TableHead>
              <TableHead>Default</TableHead>
              <TableHead>Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              ["-t, --target <port>", "3000", "Port your dev server is running on"],
              ["-p, --port <port>", "6966", "Port the editor listens on"],
              ["--host <host>", "localhost", "Hostname of your dev server"],
              ["-r, --root <path>", ".", "Project root for source file resolution"],
            ].map(([flag, def, desc]) => (
              <TableRow key={flag}>
                <TableCell className="font-mono text-[12px]">{flag}</TableCell>
                <TableCell className="text-[12px]">{def}</TableCell>
                <TableCell>{desc}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <p className="text-[14px] text-neutral-600 leading-relaxed">
          The same flags can live in a{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">.local-canvas.json</code>{" "}
          file at the project root:
        </p>
        <CodeBlock
          filename=".local-canvas.json"
          code={`{
  "target": 3000,
  "port": 6966,
  "root": "./my-react-app"
}`}
        />
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">
          <code className="font-mono">local-canvas init</code>
        </h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          Detects your project setup and adds the Babel / Vite plugin for
          source mapping. Works with Vite, Next.js, Webpack, or any bundler.
          Without it, source mapping falls back to React DevTools fiber data.
        </p>
        <CodeBlock code="npx local-canvas init" />
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">
          <code className="font-mono">local-canvas mcp</code>
        </h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          Stdio MCP server. Not run directly — bound to your agent once, then
          invoked by the agent when it needs to read annotations or mutate
          source.
        </p>
        <CodeBlock code="claude mcp add local-canvas -- npx local-canvas mcp" />
        <p className="text-[14px] text-neutral-500 leading-relaxed">
          Optional{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">--port</code>{" "}
          flag overrides the editor port the MCP talks to (default 6966).
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Examples</h2>

        <Tabs defaultValue="basic" className="w-full">
          <TabsList>
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="custom">Custom ports</TabsTrigger>
            <TabsTrigger value="monorepo">Monorepo</TabsTrigger>
          </TabsList>

          <TabsContent value="basic">
            <CodeBlock code={`# Dev server on port 3000 (default)
npx local-canvas dev

# Dev server on a different port
npx local-canvas dev --target 8080`} />
          </TabsContent>

          <TabsContent value="custom">
            <CodeBlock code={`# Editor on port 8080 instead of 6966
npx local-canvas dev --port 8080

# Expose on all interfaces (for testing from another device)
npx local-canvas dev --host 0.0.0.0`} />
          </TabsContent>

          <TabsContent value="monorepo">
            <CodeBlock code={`# Source files live in a subpackage
npx local-canvas dev --target 3000 --root ./packages/web`} />
          </TabsContent>
        </Tabs>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">How overlay injection works</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          The proxy intercepts every HTML response and injects one script tag
          before{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">{"</body>"}</code>:
        </p>
        <CodeBlock code={`<script type="module" src="/__canvas/overlay.js"></script>`} />
        <p className="text-[14px] text-neutral-500 leading-relaxed">
          Non-HTML responses (JS, CSS, JSON) pass through unmodified. URLs with{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">?__canvas_no_overlay=1</code>{" "}
          skip injection (used for the responsive-preview iframe).
        </p>

        <h3 className="text-[14px] font-semibold text-neutral-800 mt-6">Internal routes (port 6966)</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Path</TableHead>
              <TableHead>Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              ["/__canvas/overlay.js", "Compiled overlay bundle (gzip/brotli)"],
              ["/__canvas/ws", "WebSocket for mutations"],
              ["/__canvas/status", "JSON status (version, project root)"],
              ["/__canvas/annotations/*", "Annotation CRUD + thread append"],
              ["/__canvas/agent-snapshot", "Record pre-edit file contents"],
              ["/__canvas/agent-undo", "List or restore agent-undo snapshots"],
            ].map(([path, desc]) => (
              <TableRow key={path}>
                <TableCell className="font-mono text-[12px]">{path}</TableCell>
                <TableCell>{desc}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-[14px] text-neutral-500 leading-relaxed">
          All endpoints are same-origin-checked — cross-origin calls are
          rejected before any side effect runs.
        </p>
      </div>
    </div>
  );
}
