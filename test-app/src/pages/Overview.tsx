import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { CodeBlock } from "../components/CodeBlock";

export default function Overview() {
  return (
    <div className="max-w-[680px] px-6 pt-12 pb-16 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-3">Introduction</h1>
        <p className="text-[15px] text-neutral-500 leading-relaxed">
          <strong className="text-neutral-800">Canvas Editor is a visual editing overlay for React.</strong>{" "}
          Select any element, tweak its Tailwind classes, drag to reorder — every
          change modifies your actual source files via AST mutations. It runs as
          an HTTP proxy between your browser and dev server, injecting a Shadow
          DOM overlay that never conflicts with your app's styles.
        </p>
      </div>

      <CodeBlock code="npx local-canvas dev --target 3000" />

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">How it works</h2>
        <ol className="list-decimal pl-5 text-[14px] text-neutral-600 space-y-3 leading-relaxed">
          <li>
            <strong className="text-neutral-800">Add the Babel plugin</strong>{" "}
            (optional) — injects{" "}
            <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">data-source-file</code>,{" "}
            <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">data-source-line</code>, and{" "}
            <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">data-source-col</code>{" "}
            into every JSX element at dev time. Without it, source mapping falls
            back to React DevTools fiber data. Works with any bundler.
          </li>
          <li>
            <strong className="text-neutral-800">Start the editor proxy</strong> —
            listens on port <strong>3001</strong> by default, forwards requests to your
            dev server, and injects the overlay script before{" "}
            <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">{"</body>"}</code>.
          </li>
          <li>
            <strong className="text-neutral-800">Edit visually</strong> —
            click any element to select it. The properties panel opens — change spacing,
            typography, colors, layout. Every change writes directly to your source
            file via{" "}
            <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">ts-morph</code>.
            Your dev server's hot reload picks it up.
          </li>
        </ol>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Architecture</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          The editor is three pieces working together:
        </p>
        <ul className="list-disc pl-5 text-[14px] text-neutral-600 space-y-2 leading-relaxed">
          <li>
            <strong className="text-neutral-800">HTTP Proxy</strong> — forwards
            requests to your dev server, injects the overlay script into HTML responses.
          </li>
          <li>
            <strong className="text-neutral-800">Shadow DOM Overlay</strong> — renders
            in an isolated Shadow DOM at z-index 2147483647. Your app's styles never
            leak in or out.
          </li>
          <li>
            <strong className="text-neutral-800">WebSocket</strong> — mutations are
            batched (150ms), grouped by file:line, and applied via ts-morph. Full
            undo/redo stack.
          </li>
        </ul>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Supported className patterns</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          The mutation writer handles all common className formats. If no{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">className</code>{" "}
          exists, one is added automatically.
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
