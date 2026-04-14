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
          Every editable property in the properties panel. All values map to
          Tailwind utility classes.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Layout</h2>
        <PropTable
          rows={[
            ["Display", "block, inline-block, inline, flex, inline-flex, grid, hidden"],
            ["Flex direction", "row, row-reverse, col, col-reverse"],
            ["Justify content", "start, center, end, between, around, evenly"],
            ["Align items", "start, center, end, stretch, baseline"],
            ["Gap", "0–20 (Tailwind spacing scale)"],
            ["Grid columns", "1, 2, 3, 4, 5, 6, 12"],
            ["Position", "static, relative, absolute, fixed, sticky"],
            ["Inset", "auto, 0, 1–64px, full, 50%"],
            ["Z-index", "auto, 0, 10, 20, 30, 40, 50"],
            ["Overflow", "visible, hidden, auto, scroll"],
          ]}
        />
        <p className="text-[14px] text-neutral-500 leading-relaxed">
          Flex-specific controls only appear when display is flex or inline-flex.
          Grid columns only appear when display is grid.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Size</h2>
        <PropTable
          rows={[
            ["Width", "auto, 100%, 100vw, min, max, fit, 1/2, 1/3, 2/3, 1/4, 3/4"],
            ["Height", "auto, 100%, 100vh, min, max, fit, 1/2, 1/3, 2/3, 1/4, 3/4"],
            ["Min / Max width", "Same options as width"],
            ["Flex item", "default, flex-1, flex-auto, flex-initial, flex-none"],
            ["Align self", "start, center, end, stretch, baseline"],
          ]}
        />
        <p className="text-[14px] text-neutral-500 leading-relaxed">
          Flex item and align self only appear when the parent is a flex container.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Spacing</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          Padding and margin for all four sides. Controlled via sliders (0–200px)
          or by dragging the spacing badges on the canvas. Values snap to the
          Tailwind spacing scale on commit.
        </p>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          Pixel values are converted to the nearest Tailwind spacing class — 16px
          becomes{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">p-4</code>,
          24px becomes{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">p-6</code>.
          Non-standard values use arbitrary values like{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">p-[13px]</code>.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Typography</h2>
        <PropTable
          rows={[
            ["Font size", "Slider 8–120px, snaps to Tailwind (xs–9xl) or [Npx]"],
            ["Font weight", "100–900: thin, extralight, light, normal, medium, semibold, bold, extrabold, black"],
            ["Line height", "none (1), tight (1.25), snug (1.375), normal (1.5), relaxed (1.625), loose (2)"],
            ["Letter spacing", "tighter, tight, normal, wide, wider, widest"],
            ["Text align", "left, center, right"],
            ["Text color", "Color picker with Tailwind palette"],
          ]}
        />
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Background & Border</h2>
        <PropTable
          rows={[
            ["Background color", "Color picker with Tailwind palette"],
            ["Border width", "0–8px"],
            ["Border style", "solid, dashed, dotted, none"],
            ["Border color", "Color picker"],
            ["Border radius", "0–100px, snaps to Tailwind (none, sm, md, lg, xl, 2xl, 3xl, full)"],
          ]}
        />
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Effects</h2>
        <PropTable
          rows={[
            ["Box shadow", "none, sm, default, md, lg, xl, 2xl"],
            ["Opacity", "0–100% (step 5)"],
            ["Outline width", "0px+"],
            ["Outline offset", "0px+"],
            ["Outline color", "Color picker"],
          ]}
        />
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Raw class editor</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          At the bottom of the properties panel, there's a raw class editor for
          directly adding or removing any Tailwind class. Changes are sent as{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">modify-class</code>{" "}
          mutations with{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">add[]</code>{" "}
          and{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">remove[]</code>{" "}
          arrays.
        </p>
      </div>
    </div>
  );
}
