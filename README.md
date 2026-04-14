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
- **Ctrl+click context menu** — duplicate, delete, move up/down, wrap in div, copy/paste classes, AI prompt
- **Double-click text** — inline text editing with live preview
- **Breakpoint previews** — switch between mobile, tablet, desktop viewports
- **Undo/Redo** — Cmd+Z / Cmd+Shift+Z with full history tracking
- **CSS variable suggestions** — scans your stylesheets for `--custom-properties`
- **HMR aware** — automatically re-selects elements after hot reload

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `V` | Edit mode (canvas with zoom/pan) |
| `N` | Navigate mode (interact with your app normally) |
| `Cmd+Z` | Undo |
| `Cmd+Shift+Z` | Redo |
| `Cmd+S` | Save changes |
| `Escape` | Deselect / exit edit mode |
| `Ctrl+Click` | Context menu |
| `Double-click` | Edit text inline |

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
- A **canvas layer** draws selection highlights, spacing badges, resize handles, and drag indicators using the HTML-in-Canvas API (`drawElementImage`) with manual fallback. Text measurement uses [@chenglou/pretext](https://github.com/chenglou/pretext) for DOM-free layout without triggering reflows
- A **React app** renders the toolbar, properties panel, context menu, and floating inputs
- An **iframe** shows your page at different breakpoint widths for responsive editing

**WebSocket + ts-morph** handles the actual code changes. When you drag a spacing handle or change a property, a mutation is sent over WebSocket. The server uses ts-morph to find the exact JSX element in your source file and modify its className. The file is saved to disk, your dev server's HMR picks it up, and the page updates live.

## MCP Server

Local Canvas includes an MCP server for AI-assisted editing:

```bash
npx local-canvas mcp
```

Exposes tools: `modify-class`, `add-element`, `delete-element`, `edit-text`, `wrap-element` — any AI agent can call these to make visual changes to your app.

## License

MIT
