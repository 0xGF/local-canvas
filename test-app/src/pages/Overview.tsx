import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { CodeBlock } from "../components/CodeBlock";
import { LoopingClip } from "../components/demos/LoopingClip";

export default function Overview() {
  return (
    <div className="max-w-[680px] px-6 pt-12 pb-16 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-3">Introduction</h1>
        <p className="text-[15px] text-neutral-500 leading-relaxed">
          <strong className="text-neutral-800">Local Canvas is a visual editing overlay for React + Tailwind apps.</strong>{" "}
          Select any element in your running dev server, drag to adjust spacing,
          tweak classes in the properties panel, or ask an AI agent to make
          changes — every edit writes directly back to your{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">.tsx</code>{" "}
          source via ts-morph AST mutations. No export step, no re-implementation,
          no design-to-code drift.
        </p>
      </div>

      <CodeBlock code="npx local-canvas dev --target 3000" />

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">The canvas is the point</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          The editing chrome — hover outlines, selection outlines, spacing
          badges, resize grips, dimension readouts, drag value pills, zero-value
          notches — is painted on a{" "}
          <strong className="text-neutral-800">single <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">&lt;canvas&gt;</code> layer</strong>,
          not as DOM elements chasing coordinates. That keeps it pixel-aligned
          with the live page at any zoom, with zero reflow cost.
        </p>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          It's glued together from two libraries that do the heavy lifting:
        </p>
        <ul className="list-disc pl-5 text-[14px] text-neutral-600 space-y-2 leading-relaxed">
          <li>
            <strong className="text-neutral-800">HTML-in-Canvas (<code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">drawElementImage</code>)</strong> —
            Chrome's experimental Canvas API, used to rasterize the hover and
            selection outline templates with real CSS rendering (pseudo-elements,
            border-radius, the whole pipeline). Feature-detected; falls back to
            a dashed rectangle when unavailable.
          </li>
          <li>
            <strong className="text-neutral-800"><code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">@chenglou/pretext</code></strong> —
            DOM-free text measurement. Every badge sizes itself to its text; this
            returns natural width and wrapped height synchronously with no DOM
            layout. Two LRU caches wrap it so the synchronous cost happens once
            per unique text.
          </li>
        </ul>
        <LoopingClip
          src="/demos/click-to-panel.mp4"
          poster="/demos/click-to-panel.jpg"
          caption="Click an element → canvas chrome paints and the properties panel slides in."
        />
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Architecture</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          One process on port <strong>6966</strong>. Four cooperating pieces:
        </p>
        <ul className="list-disc pl-5 text-[14px] text-neutral-600 space-y-2 leading-relaxed">
          <li>
            <strong className="text-neutral-800">HTTP proxy</strong> — forwards
            every request to your dev server, injects the overlay script into
            HTML responses before{" "}
            <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">{"</body>"}</code>.
          </li>
          <li>
            <strong className="text-neutral-800">Shadow DOM overlay</strong> —
            renders inside an isolated Shadow DOM at z-index 2147483647, so your
            app's styles never leak in or out. The canvas layer paints editing
            chrome; a React app renders the toolbar, properties panel, layers
            panel, and command bar.
          </li>
          <li>
            <strong className="text-neutral-800">WebSocket + ts-morph</strong> —
            mutations travel over{" "}
            <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">/__canvas/ws</code>,
            are batched in a 150ms window, grouped by file:line, and applied
            via ts-morph AST edits. HMR picks up the file change and the page
            updates live. Full undo/redo stack.
          </li>
          <li>
            <strong className="text-neutral-800">Annotations + MCP</strong> —
            "Ask AI" annotations persist in a sqlite file at{" "}
            <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">.canvas-data/annotations.db</code>,
            exposed to the overlay at{" "}
            <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">/__canvas/annotations/*</code>{" "}
            and to AI agents via a stdio MCP subcommand that talks back to the
            same editor port.
          </li>
        </ul>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">How a click becomes a source edit</h2>
        <ol className="list-decimal pl-5 text-[14px] text-neutral-600 space-y-3 leading-relaxed">
          <li>
            <strong className="text-neutral-800">Source attrs are injected at dev time</strong>{" "}
            by the Babel/Vite plugin. Every JSX element gets{" "}
            <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">data-source-file</code>,{" "}
            <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">data-source-line</code>, and{" "}
            <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">data-source-col</code>.
            Without the plugin, the overlay falls back to React DevTools'{" "}
            <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">_debugSource</code> fiber property.
          </li>
          <li>
            <strong className="text-neutral-800">Click resolves to a source location</strong>{" "}
            by walking up the DOM tree to the nearest{" "}
            <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">data-source-*</code>.
          </li>
          <li>
            <strong className="text-neutral-800">Edits emit a mutation</strong>{" "}
            addressed by <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">{"{ filePath, line, column }"}</code>.
            ts-morph finds the JSX element at that position and edits its{" "}
            <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">className</code> or{" "}
            <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">style</code> in place. HMR applies the result.
          </li>
        </ol>
        <LoopingClip
          src="/demos/drag-to-pad.mp4"
          poster="/demos/drag-to-pad.jpg"
          caption="Drag a spacing handle to add padding — the class writes back to the source file via ts-morph."
        />
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Supported className patterns</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          The writer handles the common shapes and refuses to touch ones where a
          safe edit is undecidable. Dynamic branches (template literals with
          interpolation, identifiers, ternaries, function calls) are detected
          and left alone — the element appears read-only in the UI rather than
          being silently mutated.
        </p>

        <Tabs defaultValue="string" className="w-full">
          <TabsList>
            <TabsTrigger value="string">String</TabsTrigger>
            <TabsTrigger value="template">Template</TabsTrigger>
            <TabsTrigger value="cn">cn()</TabsTrigger>
            <TabsTrigger value="expr">Expression</TabsTrigger>
          </TabsList>
          <TabsContent value="string">
            <CodeBlock code={`<div className="mt-4 p-2">`} />
          </TabsContent>
          <TabsContent value="template">
            <CodeBlock code={`<div className={\`mt-4 \${conditional}\`}>`} />
          </TabsContent>
          <TabsContent value="cn">
            <CodeBlock code={`<div className={cn("mt-4", conditional && "p-2")}>`} />
          </TabsContent>
          <TabsContent value="expr">
            <CodeBlock code={`<div className={"mt-4 p-2"}>`} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
