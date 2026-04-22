import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";

function PropTable({ rows }: { rows: [string, string][] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[160px]">Property</TableHead>
          <TableHead>Values</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(([prop, values]) => (
          <TableRow key={prop}>
            <TableCell className="font-medium">{prop}</TableCell>
            <TableCell className="text-neutral-500">{values}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function Properties() {
  return (
    <div className="max-w-[680px] px-6 pt-12 pb-16 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-3">Properties</h1>
        <p className="text-[15px] text-neutral-500 leading-relaxed">
          Everything the properties panel exposes. The panel is organized into
          collapsible sections; only the ones relevant to the selected element
          (and its parent context) are shown.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">How values are persisted</h2>
        <ul className="list-disc pl-5 text-[14px] text-neutral-600 space-y-2 leading-relaxed">
          <li>
            <strong className="text-neutral-800">Tailwind utility classes</strong>{" "}
            are the default. Named values are written when the value is on-scale
            (<code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">p-4</code>,{" "}
            <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">text-blue-500</code>,{" "}
            <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">rounded-md</code>);
            off-scale values become arbitrary (<code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">p-[13px]</code>,{" "}
            <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">bg-[#abc123]</code>).
          </li>
          <li>
            <strong className="text-neutral-800">Inline <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">style={"{{ ... }}"}</code></strong> is
            used as a secondary path for things Tailwind doesn't express well —
            selection colors, inner shadows, custom CSS variables.
          </li>
          <li>
            <strong className="text-neutral-800">Responsive variants</strong>{" "}
            (<code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">md:</code>,{" "}
            <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">lg:</code>) are applied
            automatically when a breakpoint is active in the toolbar.
          </li>
          <li>
            <strong className="text-neutral-800">State variants</strong>{" "}
            (<code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">hover:</code>,{" "}
            <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">focus:</code>,{" "}
            <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">group-*</code>) are
            preserved across edits.
          </li>
          <li>
            The panel applies an inline preview synchronously on change, then
            clears it once the class mutation lands via HMR (no flash).
          </li>
        </ul>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Layout</h2>
        <PropTable
          rows={[
            ["Display", "block, inline-block, inline, flex, inline-flex, grid, hidden"],
            ["Position", "static, relative, absolute, fixed, sticky"],
            ["Inset", "top / right / bottom / left individually, or arbitrary px/%"],
            ["Z-index", "auto, numeric (arbitrary supported)"],
            ["Overflow", "visible, hidden, auto, scroll"],
            ["Aspect ratio", "preset or arbitrary"],
            ["Object fit / position", "cover, contain, fill, none, scale-down + position presets"],
          ]}
        />
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Flex & Grid</h2>
        <PropTable
          rows={[
            ["Flex direction", "row, row-reverse, col, col-reverse"],
            ["Justify content", "start, center, end, between, around, evenly"],
            ["Align items", "start, center, end, stretch, baseline"],
            ["Gap", "Tailwind spacing scale or arbitrary"],
            ["Flex item", "flex-1, flex-auto, flex-initial, flex-none"],
            ["Align self", "start, center, end, stretch, baseline"],
            ["Grid columns", "1–12 or arbitrary repeat(N, 1fr)"],
            ["Grid auto-flow", "row, col, dense"],
          ]}
        />
        <p className="text-[14px] text-neutral-500 leading-relaxed">
          Flex controls only appear when display is flex or inline-flex. Grid
          controls only appear when display is grid. Align-self appears when
          the parent is a flex container.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Spacing</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          Margin and padding with a linked/split toggle. In linked mode, one
          input writes <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">p-*</code>{" "}
          /{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">m-*</code>.
          In split mode, four inputs write per-side (<code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">pt</code>,{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">pr</code>,{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">pb</code>,{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">pl</code>). You can also
          drag the handles directly on the canvas — same result.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Size</h2>
        <PropTable
          rows={[
            ["Width / height", "auto, 100%, min, max, fit, fractional (1/2, 1/3, …), arbitrary px"],
            ["Min / max width & height", "Same as width / height"],
          ]}
        />
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Typography</h2>
        <PropTable
          rows={[
            ["Font family", "Dropdown (reads from Tailwind config / available fonts)"],
            ["Font size", "xs → 9xl or arbitrary px"],
            ["Font weight", "thin → black (100–900) or arbitrary numeric"],
            ["Line height", "leading-none, tight, snug, normal, relaxed, loose, arbitrary"],
            ["Letter spacing", "tracking-tighter → tracking-widest, arbitrary"],
            ["Text align", "left, center, right, justify"],
            ["Text color", "Color picker (Tailwind palette + CSS variables + arbitrary)"],
          ]}
        />
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Fill & Border</h2>
        <PropTable
          rows={[
            ["Background", "Solid color, gradient (with color stops + angle), image"],
            ["Border width", "All-linked or per-side"],
            ["Border style", "solid, dashed, dotted, double, hidden, none"],
            ["Border color", "All-linked or per-side"],
            ["Border radius", "All-linked or per-corner (tl / tr / bl / br), Tailwind presets + arbitrary"],
            ["Outline color / width / offset / style", "Standalone outline controls"],
          ]}
        />
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Effects</h2>
        <PropTable
          rows={[
            ["Box shadow", "Presets (sm → 2xl, inner) or arbitrary shadow-[...]"],
            ["Inner shadow", "Inset shadows via inline style"],
            ["Opacity", "0–100% (drag or type)"],
            ["Mix blend mode", "normal, multiply, screen, overlay, …"],
            ["Selection colors", "::selection background + foreground (inline style)"],
          ]}
        />
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Filters & transitions</h2>
        <PropTable
          rows={[
            ["Filters", "blur, brightness, contrast, grayscale, invert, saturate, hue-rotate, drop-shadow"],
            ["Backdrop filters", "backdrop-blur, backdrop-brightness, backdrop-saturate, …"],
            ["Transform", "rotate, scale (x/y split), skew, translate"],
            ["Transition", "property, duration, timing function, delay"],
          ]}
        />
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Interactivity</h2>
        <PropTable
          rows={[
            ["Cursor", "auto, default, pointer, wait, text, move, not-allowed, …"],
            ["Pointer events", "auto, none"],
            ["User select", "none, text, all, auto"],
            ["Resize", "none, both, horizontal, vertical"],
          ]}
        />
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Raw class editor</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          At the bottom of the panel, a raw-class input lets you type any
          Tailwind class directly — handy for utilities the panel doesn't
          surface. Changes go through the same{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">modify-class</code>{" "}
          mutation with{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">add[]</code>{" "}
          /{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">remove[]</code>{" "}
          arrays.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Read-only elements</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          If the selected element's{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">className</code> or{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">style</code> is a
          dynamic expression (template literal with interpolation, identifier,
          ternary, or function call), the panel shows it as read-only instead
          of silently mutating a dynamic branch. To edit, convert the
          expression to a literal string or object.
        </p>
      </div>
    </div>
  );
}
