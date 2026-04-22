import { CodeBlock } from "../components/CodeBlock";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";

export default function MCP() {
  return (
    <div className="max-w-[680px] px-6 pt-12 pb-16 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-3">MCP Server</h1>
        <p className="text-[15px] text-neutral-500 leading-relaxed">
          Local Canvas ships a stdio MCP server so your AI agent can pick up
          "Ask AI" annotations, apply canvas mutations, and report back —
          without leaving your editor and without API keys.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Setup</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          One line, no path hunting:
        </p>
        <CodeBlock code="claude mcp add local-canvas -- npx local-canvas mcp" />
        <p className="text-[14px] text-neutral-500 leading-relaxed">
          Binds the <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">local-canvas mcp</code>{" "}
          subcommand as an MCP stdio server. The same{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">local-canvas</code>{" "}
          binary also runs{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">dev</code>{" "}
          (the overlay) and{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">init</code>{" "}
          (Babel plugin scaffolding). One binary, one network port, no bridge
          process.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">How it connects</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          The MCP server itself has no port. Canvas mutations open a WebSocket
          to{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">ws://localhost:6966/__canvas/ws</code>{" "}
          per call (or your configured port). Annotation tools hit{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">http://localhost:6966/__canvas/annotations/*</code>.
          Both paths are same-origin-checked on the server.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Canvas tools</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          Write code through the same mutation pipeline the visual editor uses —
          ts-morph edits, batching, undo, HMR.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Tool</TableHead>
              <TableHead>Purpose</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              ["canvas_select_element", "Select by CSS selector or {filePath, line}"],
              ["canvas_modify_classes", "Add / remove Tailwind classes at a file:line"],
              ["canvas_insert_component", "Insert JSX before / after / as child of a target"],
              ["canvas_reorder", "Reorder siblings by {fromIndex, toIndex}"],
              ["canvas_get_page_info", "Current page URL + selected element summary"],
              ["canvas_get_page_layout", "Structural layout info for the current page"],
            ].map(([name, desc]) => (
              <TableRow key={name}>
                <TableCell className="font-mono text-[12px]">{name}</TableCell>
                <TableCell>{desc}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-[14px] text-neutral-500 leading-relaxed">
          Agents that already have Edit / Write tools (Claude Code) can also
          edit the files directly — the{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">canvas_*</code>{" "}
          tools are optional.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Annotation tools</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          Read user intent, report progress back. Status drives pin colour in
          the overlay:{" "}
          <strong className="text-neutral-800">pending</strong> (yellow) →{" "}
          <strong className="text-neutral-800">in_progress</strong> (blue,
          pulsing) →{" "}
          <strong className="text-neutral-800">resolved</strong> (green) /{" "}
          <strong className="text-neutral-800">dismissed</strong> (grey).
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[220px]">Tool</TableHead>
              <TableHead>Purpose</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              ["annotations_list_pending", "Poll pending work (no filters)"],
              ["annotations_list", "Filter by status / url"],
              ["annotations_get", "Fetch one annotation with its thread"],
              ["annotations_acknowledge", "Flip pending → in_progress (pin pulses blue)"],
              ["annotations_reply", "Append an agent message to the thread"],
              ["annotations_resolve", "Mark done (optional summary shows on row)"],
              ["annotations_dismiss", "Mark dismissed"],
            ].map(([name, desc]) => (
              <TableRow key={name}>
                <TableCell className="font-mono text-[12px]">{name}</TableCell>
                <TableCell>{desc}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Recommended lifecycle</h2>
        <CodeBlock code={`user posts annotation         -> status: pending (yellow pin)
agent acknowledges            -> status: in_progress (blue pulsing pin)
agent POSTs /__canvas/agent-snapshot with pre-edit file contents
agent edits files             (canvas_modify_classes, or its own Edit tool)
agent resolves with a summary -> status: resolved (green pin)`} />
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          If the user hits Undo on the Ask AI history row,{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">/__canvas/agent-undo</code>{" "}
          restores the files from the snapshot. Snapshots live in{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">.canvas-undo/snapshots.json</code>,
          FIFO-trimmed to the 10 most recent entries.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Where annotations live</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          Sqlite (WAL mode) at{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">{"{projectRoot}/.canvas-data/annotations.db"}</code>,
          served same-origin at{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">/__canvas/annotations/*</code>{" "}
          on the editor port. No second process, no second port, nothing leaves
          the project directory.
        </p>
        <p className="text-[14px] text-neutral-500 leading-relaxed">
          Stale / resolved annotations can be pruned with{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">bin/purge-resolved.sh</code>{" "}
          (defaults to 14 days). The trash icon in the Ask AI history header
          wipes everything in one click.
        </p>
      </div>
    </div>
  );
}
