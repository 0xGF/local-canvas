import { CodeBlock } from "../components/CodeBlock";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";

export default function Install() {
  return (
    <div className="max-w-[680px] px-6 pt-12 pb-16 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-3">Installation</h1>
        <p className="text-[15px] text-neutral-500 leading-relaxed">
          Add Local Canvas to any React + Tailwind project in under two minutes.
          The editor runs alongside your dev server — nothing is installed into
          your app bundle, and there is no production mode.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Requirements</h2>
        <ul className="list-disc pl-5 text-[14px] text-neutral-600 space-y-1 leading-relaxed">
          <li>A React project with JSX / TSX (any bundler — Vite, Next, Webpack)</li>
          <li>Tailwind CSS — the properties panel and drag handles write utility classes</li>
          <li>A running dev server with HMR (changes land by writing to source and letting HMR apply them)</li>
        </ul>
        <p className="text-[14px] text-neutral-500 leading-relaxed">
          Inline <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">style={"{{ ... }}"}</code>{" "}
          is supported as a secondary path for things Tailwind doesn't express
          well. CSS Modules, SCSS, styled-components, emotion, and styled-jsx are
          not supported.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">1. Add source mapping (recommended)</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          The Babel/Vite plugin stamps{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">data-source-file</code>,{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">data-source-line</code>, and{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">data-source-col</code>{" "}
          onto every JSX element at dev time. Without it, source mapping falls
          back to React DevTools' fiber <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">_debugSource</code>{" "}
          property — works, but less reliable across React versions.
        </p>

        <Tabs defaultValue="vite" className="w-full">
          <TabsList>
            <TabsTrigger value="vite">Vite</TabsTrigger>
            <TabsTrigger value="next">Next.js</TabsTrigger>
            <TabsTrigger value="babel">Babel / Webpack</TabsTrigger>
            <TabsTrigger value="none">No plugin</TabsTrigger>
          </TabsList>
          <TabsContent value="vite">
            <CodeBlock
              filename="vite.config.ts"
              code={`import { localCanvasPlugin } from 'local-canvas/plugin'

export default defineConfig({
  plugins: [react(), localCanvasPlugin()]
})`}
            />
          </TabsContent>
          <TabsContent value="next">
            <CodeBlock
              filename="next.config.js"
              code={`/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    swcPlugins: [
      [require.resolve('local-canvas/swc'), {}],
    ],
  },
}`}
            />
            <p className="text-[14px] text-neutral-500 leading-relaxed mt-3">
              Uses the bundled SWC plugin (WASM) — runs inside Next's own SWC
              transform, so there's no Babel step and Turbopack picks it up
              automatically. The{" "}
              <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">experimental.swcPlugins</code>{" "}
              key is Next's own naming; the plugin itself is stable.
            </p>
          </TabsContent>
          <TabsContent value="babel">
            <CodeBlock
              filename=".babelrc"
              code={`{
  "plugins": ["local-canvas/babel"]
}`}
            />
          </TabsContent>
          <TabsContent value="none">
            <p className="text-[14px] text-neutral-500 leading-relaxed py-3">
              No plugin needed. Start the editor and the overlay will fall back
              to React DevTools fiber data automatically.
            </p>
          </TabsContent>
        </Tabs>

        <p className="text-[14px] text-neutral-500 leading-relaxed">
          The plugin only runs in dev (<code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">apply: "serve"</code>{" "}
          in Vite). Zero overhead in production. Fragments are skipped.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">2. Start the editor</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          With your dev server running on port 3000, run:
        </p>
        <CodeBlock code="npx local-canvas dev" />
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          The editor listens on port{" "}
          <strong className="text-neutral-800">6966</strong>. Open{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">localhost:6966</code>{" "}
          to see your app with the overlay injected. Port 3000 still works
          directly, without the overlay.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">3. (optional) Hook up your AI agent</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          The "Ask AI" feature posts annotations — element context + your prompt
          — to a local sqlite store and lets your own MCP-compatible agent
          (Claude Code, Cursor, etc.) pick them up and edit the source. No API
          keys, no backend LLM calls, full repo context.
        </p>
        <CodeBlock code="claude mcp add local-canvas -- npx local-canvas mcp" />
        <p className="text-[14px] text-neutral-500 leading-relaxed">
          Exposes <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">canvas_*</code>{" "}
          tools (modify classes, insert, reorder, select) and{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">annotations_*</code>{" "}
          tools (list pending, acknowledge, reply, resolve, dismiss) over stdio.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">4. Start editing</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          Press <strong>C</strong> for canvas mode, click any element, and the
          properties panel opens on the right. Change spacing, colors,
          typography, layout — each change writes to your source via{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">ts-morph</code>{" "}
          and HMR applies it. Press <strong>N</strong> to navigate your app
          normally, or hold <strong>Space</strong> in canvas mode for a
          temporary interact mode.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">.gitignore</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          Local Canvas writes two per-project directories — add them to{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">.gitignore</code>:
        </p>
        <CodeBlock code={`.canvas-data/   # Ask AI annotations (sqlite)
.canvas-undo/   # agent-undo snapshots`} />
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Next steps</h2>
        <ul className="list-disc pl-5 text-[14px] text-neutral-600 space-y-1 leading-relaxed">
          <li><a href="/cli" className="text-neutral-800 underline underline-offset-2 hover:text-neutral-600">CLI Reference</a> — all flags and the config file</li>
          <li><a href="/features" className="text-neutral-800 underline underline-offset-2 hover:text-neutral-600">Features</a> — modes, spacing handles, annotations, interact mode</li>
          <li><a href="/properties" className="text-neutral-800 underline underline-offset-2 hover:text-neutral-600">Properties</a> — every category the panel exposes</li>
          <li><a href="/mcp" className="text-neutral-800 underline underline-offset-2 hover:text-neutral-600">MCP Server</a> — the tool surface your AI agent sees</li>
        </ul>
      </div>
    </div>
  );
}
