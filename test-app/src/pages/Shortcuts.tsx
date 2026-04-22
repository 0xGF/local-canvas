import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";

function ShortcutTable({ rows }: { rows: [string, string][] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[160px]">Shortcut</TableHead>
          <TableHead>Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(([key, desc]) => (
          <TableRow key={key}>
            <TableCell>
              <code className="text-[12px] bg-neutral-100 px-1.5 py-0.5 rounded font-mono">{key}</code>
            </TableCell>
            <TableCell>{desc}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function Shortcuts() {
  return (
    <div className="max-w-[680px] px-6 pt-12 pb-16 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-3">
          Keyboard Shortcuts
        </h1>
        <p className="text-[15px] text-neutral-500 leading-relaxed">
          Every shortcut the overlay binds. Mac modifiers shown — replace ⌘ with
          Ctrl on Windows/Linux. Shortcuts only fire when focus is outside a
          text input or textarea.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Modes</h2>
        <ShortcutTable
          rows={[
            ["C", "Canvas mode — edit with selection, zoom, pan"],
            ["N", "Navigate mode — interact with your app normally"],
            ["Space (hold)", "Temporary interact mode inside canvas mode"],
            ["Escape", "Select parent → deselect → close command bar → exit mode"],
          ]}
        />
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Editing</h2>
        <ShortcutTable
          rows={[
            ["⌘Z", "Undo"],
            ["⌘⇧Z", "Redo"],
            ["⌘S", "Save pending mutations to disk"],
            ["Double-click", "Inline text edit on the selected element"],
            ["Shift+Click", "Add / remove from multi-selection"],
            ["Alt+Drag", "Marquee-select a rectangle of elements"],
            ["Ctrl+Click", "Context menu (edit text, duplicate, delete, Ask AI, …)"],
          ]}
        />
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Panels & tools</h2>
        <ShortcutTable
          rows={[
            ["A", "Toggle annotate tool (Ask AI)"],
            ["L", "Toggle layers panel"],
            ["H", "Toggle Ask AI history popover"],
            ["⌘K", "Open command bar"],
            ["Alt+P", "Pause / resume animations and transitions"],
          ]}
        />
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Annotations</h2>
        <ShortcutTable
          rows={[
            ["[", "Navigate to previous annotation pin"],
            ["]", "Navigate to next annotation pin"],
            ["Drag pin", "Reposition an annotation pin (persisted)"],
            ["Right-click pin", "Dismiss an annotation pin"],
          ]}
        />
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Viewport</h2>
        <ShortcutTable
          rows={[
            ["⌘+Scroll", "Zoom toward cursor (clamped 10–500%)"],
            ["Middle-drag", "Pan the canvas"],
            ["Trackpad pinch", "Zoom"],
            ["Scroll", "Pan up / down when zoomed in"],
            ["⌘0", "Reset zoom and pan"],
          ]}
        />
        <p className="text-[14px] text-neutral-500 leading-relaxed">
          Viewport state (zoom + pan) is persisted to localStorage and restored
          on reload.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Inputs</h2>
        <ShortcutTable
          rows={[
            ["Drag label", "Scrub a numeric input up / down"],
            ["Shift+Drag label", "Fine-grained scrub (smaller step)"],
          ]}
        />
      </div>
    </div>
  );
}
