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
          How edits flow from the overlay to your source files.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">WebSocket protocol</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          The overlay connects to{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">/__canvas/ws</code>{" "}
          on the proxy. All edits, undo/redo, AI commands, and component scanning
          flow through this single WebSocket connection. Mutations are batched
          with a 150ms window and grouped by file:line before being applied.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Mutation types</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">Type</TableHead>
              <TableHead>Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              ["modify-class", "Add or remove Tailwind classes on an element's className attribute"],
              ["modify-style", "Change an inline CSS property"],
              ["reorder", "Move a child element to a different position within its parent"],
              ["insert", "Add a new component before, after, or as a child of an element"],
              ["delete", "Remove an element from the JSX tree"],
              ["modify-text", "Change the text content of an element"],
            ].map(([type, desc]) => (
              <TableRow key={type}>
                <TableCell className="font-mono text-[12px]">{type}</TableCell>
                <TableCell>{desc}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Mutation shape</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          Every mutation includes a source location and type-specific fields:
        </p>
        <CodeBlock
          filename="modify-class mutation"
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
          Uses{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">ts-morph</code>{" "}
          to find the JSX element at the given line/column and modify the
          className attribute in place.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Client → Server messages</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">Type</TableHead>
              <TableHead className="w-[160px]">Fields</TableHead>
              <TableHead>Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              ["mutation", "id, mutation", "Apply a source code mutation"],
              ["undo", "—", "Undo last mutation"],
              ["redo", "—", "Redo last undone mutation"],
              ["ai-command", "prompt, elementContext", "Run AI command on selected element"],
              ["save", "—", "Flush pending mutations to disk"],
              ["scan-components", "—", "Scan project for React components"],
              ["get-completions", "—", "Get code completions"],
            ].map(([type, fields, desc]) => (
              <TableRow key={type}>
                <TableCell className="font-mono text-[12px]">{type}</TableCell>
                <TableCell className="font-mono text-[12px] text-neutral-500">{fields}</TableCell>
                <TableCell>{desc}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Server → Client messages</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Type</TableHead>
              <TableHead>Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              ["mutation-result", "Result of mutation application (success, diff, filesModified)"],
              ["ai-stream", "Streaming AI response chunks"],
              ["completions", "Code completion suggestions"],
              ["components-scanned", "Scanned components list and file count"],
              ["error", "Error message"],
            ].map(([type, desc]) => (
              <TableRow key={type}>
                <TableCell className="font-mono text-[12px]">{type}</TableCell>
                <TableCell>{desc}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Undo / Redo</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          The mutation writer maintains an undo stack and a redo stack. Each entry
          is a snapshot of file contents before the mutation was applied. Undo
          restores the previous file state and pushes the current state to the redo
          stack. After undo/redo, the overlay waits 500ms for hot reload to complete,
          then refreshes the selected element.
        </p>
      </div>
    </div>
  );
}
