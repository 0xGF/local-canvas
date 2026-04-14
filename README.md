# Local Canvas

A visual editing overlay for React apps. Select any element, tweak Tailwind classes, drag to adjust spacing — every change writes directly to your source files via AST mutations.

## Quick Start

```bash
npm install local-canvas
npx local-canvas dev --target 3000
```

Then open `http://localhost:3001` in your browser.

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
| `C` | Toggle component view |
| `Cmd+Z` | Undo |
| `Cmd+Shift+Z` | Redo |
| `Cmd+S` | Save changes |
| `Cmd+K` | Command bar |
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

```
Browser                          Server
  |                                |
  |  Shadow DOM Overlay            |
  |  (React app in shadow root)   |
  |                                |
  |  Canvas Layer                  |
  |  (selection, badges, handles)  |
  |                                |
  |  --- WebSocket (mutations) --> |
  |                                |  ts-morph (AST)
  |  <-- HMR (file changed) ----- |  writes to disk
  |                                |
  |  Iframe (breakpoint preview)   |
  |  (320px / 768px / 1280px)      |
```

## MCP Server

Local Canvas includes an MCP server for AI-assisted editing:

```bash
npx local-canvas mcp
```

Exposes tools: `modify-class`, `add-element`, `delete-element`, `edit-text`, `wrap-element` — any AI agent can call these to make visual changes to your app.

## License

MIT
