import { CodeBlock } from "../components/CodeBlock";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";

export default function Install() {
  return (
    <div className="max-w-[680px] px-6 pt-12 pb-16 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-3">Installation</h1>
        <p className="text-[15px] text-neutral-500 leading-relaxed">
          Add the canvas editor to any React + Tailwind project in under 2 minutes.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">1. Add source mapping (optional)</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          The Babel plugin injects source location attributes into every JSX element
          at dev time. Without it, source mapping falls back to React DevTools fiber
          data — works but less reliable.
        </p>

        <Tabs defaultValue="vite" className="w-full">
          <TabsList>
            <TabsTrigger value="vite">Vite</TabsTrigger>
            <TabsTrigger value="babel">Babel / Webpack / Next</TabsTrigger>
            <TabsTrigger value="none">No plugin</TabsTrigger>
          </TabsList>
          <TabsContent value="vite">
            <CodeBlock
              filename="vite.config.ts"
              code={`import { canvasEditorPlugin } from 'local-canvas/plugin'

export default defineConfig({
  plugins: [react(), canvasEditorPlugin()]
})`}
            />
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
              No plugin needed. Just start the proxy — source mapping uses React
              DevTools fiber data automatically.
            </p>
          </TabsContent>
        </Tabs>

        <p className="text-[14px] text-neutral-600 leading-relaxed">
          The plugin adds three attributes to each JSX element:
        </p>
        <ul className="list-disc pl-5 text-[14px] text-neutral-600 space-y-1 leading-relaxed">
          <li><code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">data-source-file</code> — relative path to source file</li>
          <li><code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">data-source-line</code> — line number</li>
          <li><code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">data-source-col</code> — column number</li>
        </ul>
        <p className="text-[14px] text-neutral-500 leading-relaxed">
          Only runs in dev — zero overhead in production. Fragments are skipped.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">2. Start the editor</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          Start your dev server, then run the canvas editor pointing at it:
        </p>
        <CodeBlock code="npx local-canvas dev" />
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          The proxy starts on port <strong className="text-neutral-800">3001</strong>.
          Open{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">localhost:3001</code>{" "}
          to see your app with the toolbar. Port 3000 still works without the overlay.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">3. Start editing</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          Press <strong>V</strong> to enter edit mode, then click
          any element. The properties panel opens on the right — change spacing,
          colors, typography, layout. Every change writes to your source files
          via{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">ts-morph</code>.
          Your dev server's hot reload picks it up.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Next steps</h2>
        <ul className="list-disc pl-5 text-[14px] text-neutral-600 space-y-1 leading-relaxed">
          <li><a href="/cli" className="text-neutral-800 underline underline-offset-2 hover:text-neutral-600">CLI Reference</a> — all flags and options</li>
          <li><a href="/features" className="text-neutral-800 underline underline-offset-2 hover:text-neutral-600">Features</a> — toolbar modes and editing capabilities</li>
          <li><a href="/properties" className="text-neutral-800 underline underline-offset-2 hover:text-neutral-600">Properties</a> — every editable CSS property</li>
        </ul>
      </div>
    </div>
  );
}
