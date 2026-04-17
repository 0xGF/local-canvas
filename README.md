# Local Canvas

A visual editing overlay for React apps. Select any element, tweak Tailwind classes, drag to adjust spacing — every change writes directly to your source files via AST mutations.

## Quick Start

```bash
# 1. Start your dev server (e.g. Vite on port 3000)
cd my-react-app && npm run dev

# 2. In another terminal, start local-canvas pointing at your app
npx local-canvas dev --target 3000 --root ./my-react-app
```

Then open `http://localhost:3001` in your browser.

The `--root` flag tells Local Canvas where your source files live so it can write changes back to them. If your source files are in the current directory, you can omit it.

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--target` | `3000` | Port your dev server runs on |
| `--port` | `3001` | Port for the Local Canvas editor |
| `--root` | `.` | Path to your project's source root |
| `--host` | `localhost` | Dev server hostname |

You can also put these in a `.local-canvas.json` file in your project root:

```json
{
  "target": 3000,
  "port": 3001,
  "root": "./my-react-app"
}
```

## How It Works

1. **HTTP Proxy** — forwards requests to your dev server, injects the overlay script into HTML responses
2. **Shadow DOM Overlay** — renders in an isolated Shadow DOM at z-index 2147483647. Your app's styles never leak in or out
3. **WebSocket** — mutations are batched (150ms), grouped by file:line, and applied via ts-morph. Full undo/redo stack

## Features

- **Click to select** any element — properties panel opens with spacing, layout, typography, colors
- **Drag spacing handles** — margin and padding notches on every edge, drag to adjust values
- **Drag from zero** — elements with no spacing show grab notches to start adding margin/padding
- **Resize handles** — drag corners/edges to adjust width and height
- **Ctrl+click context menu** — edit text, select parent, duplicate, delete, move up/down, copy/paste classes, Ask AI
- **Escape to select parent** — step up the DOM tree (like Figma)
- **Double-click text** — inline text editing with live preview
- **Breakpoint previews** — switch between mobile, tablet, desktop viewports
- **Undo/Redo** — Cmd+Z / Cmd+Shift+Z with full history tracking and canvas flash feedback
- **CSS variable suggestions** — scans your stylesheets for `--custom-properties`
- **HMR aware** — automatically re-selects elements after hot reload
- **Animation pause** — freeze all CSS animations and transitions to inspect moving elements
- **Interact mode** — hold Space to click through to your app (open modals, navigate, expand dropdowns) without leaving edit mode
- **Annotation pins** — Ask AI annotations show as numbered pins on the page. Pins auto-pick the best corner to avoid overlap, cluster when dense, pulse when new, and can be dragged to reposition or right-clicked to dismiss

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `V` | Edit mode (canvas with zoom/pan) |
| `N` | Navigate mode (interact with your app normally) |
| `Cmd+Z` | Undo |
| `Cmd+Shift+Z` | Redo |
| `Cmd+S` | Save changes |
| `Escape` | Select parent (or deselect / exit edit mode at top level) |
| `Alt+P` | Pause/resume animations |
| `Space` (hold) | Interact mode — click through to your app |
| `A` | Toggle annotate tool |
| `[` / `]` | Navigate between annotation pins |
| `Ctrl+Click` | Context menu |
| `Double-click` | Edit text inline |
| Drag pin | Reposition an annotation pin (persisted) |
| Right-click pin | Dismiss an annotation pin |

## Setup with Vite

```ts
// vite.config.ts
import { localCanvasPlugin } from 'local-canvas/plugin'

export default defineConfig({
  plugins: [localCanvasPlugin()],
})
```

## Setup with Babel (any bundler)

```json
{
  "plugins": ["local-canvas/babel"]
}
```

The Babel plugin injects `data-source-file`, `data-source-line`, and `data-source-col` into every JSX element at dev time, enabling source mapping from the DOM back to your code.

## Architecture

Local Canvas has three parts:

**HTTP Proxy** sits between your browser and dev server. It forwards all requests and injects the overlay script into HTML responses. Your app runs normally — the proxy just adds the editing layer on top.

**Shadow DOM Overlay** renders inside an isolated Shadow DOM (z-index 2147483647) so your app's styles never conflict. Inside it:
- A **canvas layer** draws selection highlights, spacing badges, resize handles, and drag indicators
- A **React app** renders the toolbar, properties panel, context menu, and floating inputs
- An **iframe** shows your page at different breakpoint widths for responsive editing

**WebSocket + ts-morph** handles the actual code changes. When you drag a spacing handle or change a property, a mutation is sent over WebSocket. The server uses ts-morph to find the exact JSX element in your source file and modify its className. The file is saved to disk, your dev server's HMR picks it up, and the page updates live.

## Built on

Local Canvas is glued together from three third-party libraries that do the heavy lifting:

- **[HTML-in-Canvas (`drawElementImage`)](https://developer.chrome.com/blog/html-in-canvas)** — Chrome's experimental Canvas API for rendering HTML elements directly into a 2D canvas context. Used for all overlay badges, spacing indicators, and labels. Falls back to manual canvas drawing when unavailable.
- **[@chenglou/pretext](https://github.com/chenglou/pretext)** — DOM-free text measurement. Measures text width without touching the DOM (no reflows). Used everywhere text is drawn on the canvas overlay.
- **[agentation-mcp](https://github.com/benjitaylor/agentation)** — MCP bridge for the Ask AI context menu. Routes overlay AI requests to your connected AI agent instead of a direct LLM API call.

## Ask AI (agentation bridge)

The context menu's **Ask AI** option sends element context + your prompt to an AI agent via [agentation-mcp](https://github.com/benjitaylor/agentation). Instead of calling an LLM API directly (needs keys, limited context), requests flow to whatever MCP-compatible agent you have connected — Claude Code, Cursor, etc. — which has full repo context and can make real code changes, not just class swaps.

**Setup:**

```bash
# Add agentation-mcp to your MCP-compatible agent (e.g. Claude Code)
claude mcp add agentation -- npx agentation-mcp server
```

The agentation HTTP server starts on `:4747` alongside Local Canvas (via `bin/start.sh`). When you ctrl-click an element → Ask AI → type a prompt, the overlay POSTs an annotation with the element's file path, line, tag, and classes. Your agent picks it up via MCP tools (`agentation_get_pending`, `agentation_resolve`, etc.) and makes the changes.

## License

MIT
