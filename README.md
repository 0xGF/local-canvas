# Local Canvas

A visual editing overlay for **React + Tailwind** apps. Select any element in your running dev server, drag to adjust spacing, tweak classes in the properties panel, ask an AI agent to make changes — every edit writes directly back to your `.tsx` source via ts-morph AST mutations. No export step, no re-implementation, no design-to-code drift.

The editing chrome (outlines, spacing notches, resize handles, dimension readouts, drag badges) is **painted on a single `<canvas>`** using Chrome's experimental `drawElementImage` API, so it stays pixel-aligned with the live page at any zoom without causing DOM reflow.

## Quick Start

```bash
# 1. Start your dev server (e.g. Vite on port 3000)
cd my-react-app && npm run dev

# 2. In another terminal, start local-canvas pointing at your app
npx local-canvas dev --target 3000 --root ./my-react-app

# 3. (optional) Hook up your AI agent for the Ask AI feature
claude mcp add local-canvas -- npx local-canvas mcp
```

Then open `http://localhost:6966` in your browser.

The `--root` flag tells Local Canvas where your source files live so it can write changes back to them. If your source files are in the current directory, you can omit it.

## What it works with

Local Canvas is built for a specific stack. It works well when your project is:

- **React + JSX/TSX** — source-mapping relies on the Babel/Vite plugin stamping `data-source-file/line/col` onto every JSX element, and falls back to React DevTools' `_debugSource` fiber property. Non-React frameworks are not supported.
- **Styled with Tailwind utility classes** — the properties panel, drag handles, and `canvas_modify_classes` mutation all target `className` strings. Named values (`p-4`, `text-blue-500`) are used when they exist in the Tailwind scale; otherwise arbitrary values are written (`p-[13px]`, `bg-[#abc123]`). Responsive (`md:`), state (`hover:`, `focus:`), and group variants are preserved and respected when the breakpoint switcher is active.
- **Running in a dev server with HMR** — edits land by writing to source and letting the dev server's HMR apply them. There is no build-time step and no production mode; without the dev plugin, elements cannot be mapped back to source.

Inline `style={{ ... }}` object literals are also supported, as a secondary path, for properties Tailwind doesn't express well (selection colors, inset shadows, custom CSS variables). Spread assignments, ternaries, function calls, and interpolated template literals in `className` / `style` are detected and left untouched — those elements appear read-only rather than mutated unsafely.

**Not supported:** CSS Modules, SCSS, styled-components, emotion, styled-jsx, plain CSS files, raw `style="..."` string attributes. React Server Components are untested.

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--target` | `3000` | Port your dev server runs on |
| `--port` | `6966` | Port for the Local Canvas editor |
| `--root` | `.` | Path to your project's source root |
| `--host` | `localhost` | Dev server hostname |

You can also put these in a `.local-canvas.json` file in your project root:

```json
{
  "target": 3000,
  "port": 6966,
  "root": "./my-react-app"
}
```

### Gitignore

Local Canvas writes two per-project directories — add them to `.gitignore`:

```
.canvas-data/   # Ask AI annotations (sqlite)
.canvas-undo/   # agent-undo snapshots
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
- **Annotations** — add annotations to any element via the annotate tool (`A`) or context menu. Annotations show as numbered pins that auto-pick the best corner, cluster when dense, pulse when new, and can be dragged or right-click dismissed
- **Multi-element selection** — Shift+click to select multiple elements, Alt+drag for marquee select. Group annotations target all selected elements at once

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `C` | Canvas mode (edit with zoom/pan) |
| `N` | Navigate mode (interact with your app normally) |
| `Cmd+Z` | Undo |
| `Cmd+Shift+Z` | Redo |
| `Cmd+S` | Save changes |
| `Escape` | Select parent (or deselect / exit edit mode at top level) |
| `Alt+P` | Pause/resume animations |
| `Space` (hold) | Interact mode — click through to your app |
| `A` | Toggle annotate tool |
| `[` / `]` | Navigate between annotation pins |
| `Shift+Click` | Add/remove element from multi-selection |
| `Alt+Drag` | Marquee select elements in a rectangle |
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

Local Canvas has four pieces, all running in one process on port `:6966`:

**HTTP Proxy** sits between your browser and dev server. It forwards all requests and injects the overlay script into HTML responses. Your app runs normally — the proxy just adds the editing layer on top.

**Shadow DOM Overlay** renders inside an isolated Shadow DOM (z-index 2147483647) so your app's styles never conflict. Inside it:
- A **canvas layer** draws selection highlights, spacing badges, resize handles, and drag indicators
- A **React app** renders the toolbar, properties panel, context menu, and floating inputs
- An **iframe** shows your page at different breakpoint widths for responsive editing

**WebSocket + ts-morph** handles the actual code changes. When you drag a spacing handle or change a property, a mutation is sent over WebSocket. The server uses ts-morph to find the exact JSX element in your source file and modify its className. The file is saved to disk, your dev server's HMR picks it up, and the page updates live.

**Annotations store** lives in the same process. Ask AI annotations persist in `{projectRoot}/.canvas-data/annotations.db` (sqlite, WAL mode), exposed to the overlay at `/__canvas/annotations/*` (same origin, no second port). AI agents read and write them via `local-canvas mcp`, a stdio MCP subcommand that talks back to `:6966` over HTTP + WebSocket — one binary, one network port, no bridge process.

## Built on

Local Canvas is glued together from two third-party libraries that do the heavy lifting:

- **[HTML-in-Canvas (`drawElementImage`)](https://developer.chrome.com/blog/html-in-canvas)** — Chrome's experimental Canvas API for rendering HTML elements directly into a 2D canvas context. Used for all overlay badges, spacing indicators, and labels. Falls back to manual canvas drawing when unavailable.
- **[@chenglou/pretext](https://github.com/chenglou/pretext)** — DOM-free text measurement. Measures text width without touching the DOM (no reflows). Used everywhere text is drawn on the canvas overlay.

## Ask AI (annotations)

The context menu's **Ask AI** option posts an annotation — element context + your prompt — to the editor's own sqlite store at `{projectRoot}/.canvas-data/annotations.db`. Instead of calling an LLM API directly (needs keys, limited context), an MCP-compatible agent (Claude Code, Cursor, etc.) picks the annotation up via MCP tools and makes the changes in your source.

**Setup (one line, no path hunting):**

```bash
claude mcp add local-canvas -- npx local-canvas mcp
```

That binds the `local-canvas mcp` CLI subcommand as an MCP stdio server. The same `local-canvas` binary also runs `dev` (the overlay) and `init` (Babel plugin scaffolding). No second process, no second port.

When you ctrl-click an element → Ask AI → type a prompt, the overlay POSTs the annotation to `/__canvas/annotations` on the editor server (default `:6966`). Your agent reads it via MCP and makes the edits.

### MCP tool surface

Both annotation tools and direct-mutation tools live on the same MCP server:

**Annotations (read user intent + report back):**
- `annotations_list_pending` — poll pending work
- `annotations_list` — filter by status / url
- `annotations_get` — fetch one with its thread
- `annotations_acknowledge` — flip `pending → in_progress` so the pin pulses blue (tells the user work has started)
- `annotations_reply` — append an agent message to the thread
- `annotations_resolve` — mark done (optional `summary` shows on the row)
- `annotations_dismiss` — mark dismissed

**Canvas mutations (write code via the overlay's WebSocket):**
- `canvas_modify_classes` — add/remove Tailwind classes by file:line
- `canvas_insert_component` — insert JSX
- `canvas_reorder` — reorder children
- plus `canvas_select_element`, `canvas_get_page_info`

Agents with their own `Edit`/`Write` tools (Claude Code) can keep using those — the `canvas_*` tools are optional.

### Recommended annotation lifecycle

```
user posts annotation  →  status: pending (yellow pin)
agent calls annotations_acknowledge  →  status: in_progress (blue pulsing pin)
agent POSTs /__canvas/agent-snapshot with pre-edit file contents
agent edits files (ts-morph via canvas_modify_classes, or its own Edit tool)
agent calls annotations_resolve with a 1-sentence summary  →  status: resolved (green pin)
```

If the user hits **Undo** on the history row, `/__canvas/agent-undo` restores files from the snapshot.

### Agent-undo HTTP endpoints

The editor exposes three same-origin endpoints on `:6966` so snapshots land locally (they never leave the project):

- `POST /__canvas/agent-snapshot` — record pre-edit contents before writing
  ```json
  {
    "annotationId": "…",
    "files": [{ "path": "src/components/Header.tsx", "contentBefore": "…" }],
    "summary": "Add text-blue-600 to h2 in Overview.tsx"
  }
  ```
- `POST /__canvas/agent-undo` — body `{ "annotationId": "…" }`; restores the files and drops the snapshot.
- `GET /__canvas/agent-undo` — lists recoverable entries (no file contents, just metadata).

Snapshots live in `.canvas-undo/snapshots.json` at the project root, FIFO-trimmed to the 10 most recent entries.

Group annotations (`elementPaths.length > 1`) follow the same dismissal flow — resolving once covers the whole group. For multi-file edits, include every affected file in a single `agent-snapshot` call so **Undo** restores them together.

### Housekeeping

- Trash icon in the Ask AI history header wipes every annotation in one click.
- `bin/purge-resolved.sh` removes resolved / dismissed annotations older than N days from `.canvas-data/annotations.db` (defaults to 14 days). `DRY_RUN=1 bin/purge-resolved.sh` previews; `CANVAS_DB=/path/to/db bin/purge-resolved.sh` overrides the location.

## License

MIT
