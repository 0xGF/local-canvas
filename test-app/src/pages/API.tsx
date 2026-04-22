import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { CodeBlock } from "../components/CodeBlock";

export default function API() {
  return (
    <div className="max-w-[680px] px-6 pt-12 pb-16 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-3">
          API & Mutations
        </h1>
        <p className="text-[15px] text-neutral-500 leading-relaxed">
          How edits flow from the overlay to your source files, and what the
          editor exposes over HTTP and WebSocket.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">WebSocket (mutations)</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          The overlay opens a single WebSocket to{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">/__canvas/ws</code>.
          Every spacing drag, property change, reorder, or class edit sends one
          message through it. The server batches incoming mutations in a 150ms
          window, groups them by{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">file:line</code>,
          applies them via ts-morph, and writes the result back to disk. Your
          dev server's HMR applies the change live.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Mutation types</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">Type</TableHead>
              <TableHead>Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              ["modify-class", "Add or remove Tailwind classes on className"],
              ["modify-style", "Change a property on an inline style={{...}} object literal"],
              ["modify-text", "Change the direct text content of an element"],
              ["reorder", "Move a child element to a different index within its parent"],
              ["insert", "Insert a new component before / after / as child of a target"],
              ["duplicate-element", "Clone an element (same file:line source)"],
              ["delete", "Remove an element from the JSX tree"],
            ].map(([type, desc]) => (
              <TableRow key={type}>
                <TableCell className="font-mono text-[12px]">{type}</TableCell>
                <TableCell>{desc}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-[14px] text-neutral-500 leading-relaxed">
          All types route through{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">src/core/writer/</code> —
          ts-morph AST edits with a batching + undo layer on top. No regex or
          string replacement on user source, ever.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Mutation shape</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          Every mutation carries a source address resolved from a clicked
          element's <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">data-source-*</code>{" "}
          attributes (or React fiber <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">_debugSource</code> fallback):
        </p>
        <CodeBlock
          filename="modify-class"
          code={`{
  type: "modify-class",
  source: {
    filePath: "src/components/Card.tsx",
    line: 12,
    column: 4
  },
  add: ["p-6", "rounded-xl"],
  remove: ["p-4", "rounded-lg"]
}`}
        />
        <p className="text-[14px] text-neutral-500 leading-relaxed">
          ts-morph walks the AST, finds the JSX element at{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">{"{line, column}"}</code>,
          and edits the attribute in place. Named Tailwind values are preferred
          (<code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">p-4</code>); off-scale
          values become arbitrary (<code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">p-[13px]</code>).
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Read-only cases</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          The writer refuses to modify dynamic className branches: template
          literals with interpolation, identifiers, ternaries, and function
          calls. The UI surfaces these elements as read-only rather than
          silently mutating them — adding classes to a dynamic branch would
          change runtime semantics unpredictably.
        </p>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          Inline <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">style={"{{ ... }}"}</code>{" "}
          follows the same rule — only object literals are mutable. Spreads,
          identifiers, and template literals bail out.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">HTTP endpoints on :6966</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[240px]">Path</TableHead>
              <TableHead>Purpose</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              ["GET /__canvas/*.js", "Compiled overlay bundle (gzip/brotli)"],
              ["GET /__canvas/status", "{ version, projectRoot }"],
              ["GET /__canvas/ws", "WebSocket for mutations"],
              ["GET/POST/PATCH/DELETE /__canvas/annotations[/:id]", "Annotation CRUD + thread append"],
              ["POST /__canvas/agent-snapshot", "Record pre-edit file contents for agent undo"],
              ["GET /__canvas/agent-undo", "List recoverable snapshots (metadata only)"],
              ["POST /__canvas/agent-undo", "Restore files from a snapshot by annotationId"],
            ].map(([path, desc]) => (
              <TableRow key={path}>
                <TableCell className="font-mono text-[11px]">{path}</TableCell>
                <TableCell>{desc}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-[14px] text-neutral-500 leading-relaxed">
          Every endpoint is same-origin-checked via Origin / Referer headers —
          cross-origin XHR is rejected before any side effect runs.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Undo / redo</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          The mutation writer keeps an undo stack and a redo stack; each entry
          is a file-content snapshot taken before the mutation lands. Undo
          restores the previous state and pushes the current state to the redo
          stack. After an undo, the overlay waits briefly for HMR to re-render,
          then re-selects the same element at its new position (handy after
          reorders).
        </p>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          Agent-driven edits use a separate snapshot path (<code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">/__canvas/agent-snapshot</code>)
          that stores pre-edit contents at{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">.canvas-undo/snapshots.json</code>{" "}
          (FIFO, 10 entries). The Ask AI history row in the toolbar shows an
          Undo button per annotation.
        </p>
      </div>
    </div>
  );
}
