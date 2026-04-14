import { CodeBlock } from "../components/CodeBlock";

export default function Features() {
  return (
    <div className="max-w-[680px] px-6 pt-12 pb-16 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-3">Features</h1>
        <p className="text-[15px] text-neutral-500 leading-relaxed">
          Toolbar modes, editing capabilities, and responsive preview.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Toolbar</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed 2xl:mb-[21px]">
          The toolbar appears at the bottom of the viewport on the proxy port.
        </p>
        <ul className="list-disc pl-5 text-[14px] text-neutral-600 space-y-2 leading-relaxed">
          <li><strong className="text-neutral-800">Select mode</strong> (<code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">V</code>) — click elements to select them. Shows tag name, dimensions, and spacing.</li>
          <li><strong className="text-neutral-800">Pan mode</strong> (<code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">M</code>) — click and drag to pan. Also: hold Space or middle-click drag.</li>
          <li><strong className="text-neutral-800">Undo / Redo</strong> (<code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">⌘Z</code>) — full history stack. Every mutation is tracked and reversible.</li>
          <li><strong className="text-neutral-800">Save</strong> (<code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">⌘S</code>) — flush pending mutations to disk. Badge shows unsaved count.</li>
          <li><strong className="text-neutral-800">Zoom</strong> (<code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">⌘Scroll</code>) — zoom toward cursor. Click percentage to reset. Range: 10%–500%.</li>
          <li><strong className="text-neutral-800">Components</strong> (<code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">C</code>) — browse and drag React components onto the page.</li>
        </ul>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Selection</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          In select mode, hovering highlights elements. Clicking selects and opens
          the properties panel. The overlay reads{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">data-source-*</code>{" "}
          attributes to resolve source location.
        </p>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          The picker uses{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">elementsFromPoint()</code>{" "}
          and skips structural elements:{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">html</code>,{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">body</code>,{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">#root</code>,{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">#__next</code>,{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">#app</code>.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Spacing handles</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          Selected elements show spacing badges for padding and margin on all four
          sides. Drag any badge to adjust. Shows live tooltip with current pixel
          value and snaps to Tailwind spacing scale on release. Drag deltas are
          divided by zoom level for accurate adjustment at any zoom.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Drag to reorder</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          Drag the element's tag badge to reorder within its parent. Hit tests all
          siblings and shows an insertion line. On drop, a{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">reorder</code>{" "}
          mutation reorders the JSX children in your source file.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">AI commands</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          Press <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">⌘K</code> to
          open the command bar. Describe changes in plain English. Works best with
          a selected element — the AI gets tag, classes, file path, and line number
          as context.
        </p>
        <p className="text-[14px] text-neutral-600 leading-relaxed">Example prompts:</p>
        <ul className="list-disc pl-5 text-[14px] text-neutral-600 space-y-1 leading-relaxed">
          <li>Make this full width with centered content</li>
          <li>Add a shadow and rounded corners</li>
          <li>Make this a 3-column grid with gap</li>
        </ul>
        <p className="text-[14px] text-neutral-500 leading-relaxed">
          Requires{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">OPENAI_API_KEY</code>{" "}
          or{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">ANTHROPIC_API_KEY</code>.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Responsive preview</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          Renders in a real iframe at the selected width —{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">@media</code>{" "}
          queries fire at the correct breakpoint. Available presets:
        </p>
        <ul className="list-disc pl-5 text-[14px] text-neutral-600 space-y-1 leading-relaxed">
          <li>Mobile S (320px), Mobile (375px), Mobile L (425px)</li>
          <li>Tablet (768px), Laptop (1024px)</li>
          <li>Desktop (1280px), Wide (1536px), Full</li>
        </ul>
        <p className="text-[14px] text-neutral-500 leading-relaxed">
          The iframe loads with{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">?__canvas_no_overlay=1</code>{" "}
          to prevent nested overlay injection.
        </p>
      </div>
    </div>
  );
}
