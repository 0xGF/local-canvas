import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";

export default function Shortcuts() {
  return (
    <div className="max-w-[680px] px-6 pt-12 pb-16 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-3">
          Keyboard Shortcuts
        </h1>
        <p className="text-[15px] text-neutral-500 leading-relaxed">
          All available keyboard shortcuts. Mac shortcuts shown — replace ⌘ with
          Ctrl on Windows/Linux.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Modes</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">Shortcut</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              ["V", "Toggle select mode"],
              ["M", "Toggle pan mode"],
              ["C", "Toggle component view"],
              ["Escape", "Deselect / close command bar / exit component view"],
            ].map(([key, desc]) => (
              <TableRow key={key}>
                <TableCell>
                  <code className="text-[12px] bg-neutral-100 px-1.5 py-0.5 rounded font-mono">{key}</code>
                </TableCell>
                <TableCell>{desc}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-[14px] text-neutral-500 leading-relaxed">
          Mode shortcuts only fire when focus is not inside a text input or textarea.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Commands</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">Shortcut</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              ["⌘Z", "Undo"],
              ["⌘⇧Z", "Redo"],
              ["⌘K", "Open AI command bar"],
              ["⌘S", "Save all changes"],
            ].map(([key, desc]) => (
              <TableRow key={key}>
                <TableCell>
                  <code className="text-[12px] bg-neutral-100 px-1.5 py-0.5 rounded font-mono">{key}</code>
                </TableCell>
                <TableCell>{desc}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Navigation</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">Shortcut</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              ["⌘Scroll", "Zoom toward cursor"],
              ["Space+Drag", "Pan canvas"],
              ["Middle+Drag", "Pan canvas"],
              ["Scroll", "Pan up/down (when zoomed)"],
            ].map(([key, desc]) => (
              <TableRow key={key}>
                <TableCell>
                  <code className="text-[12px] bg-neutral-100 px-1.5 py-0.5 rounded font-mono">{key}</code>
                </TableCell>
                <TableCell>{desc}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
