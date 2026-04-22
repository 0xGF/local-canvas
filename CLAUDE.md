# Local Canvas — AI Agent Guide

**Read this before touching anything.** This file exists because AI agents keep misunderstanding the product and "fixing" things that are not broken.

---

## What this project actually is

Local Canvas is a **super-fast visual editing tool for React apps**, built on top of **HTML-in-Canvas** — Chrome's experimental `drawElementImage` API that renders live DOM elements into a 2D canvas context.

It is NOT:
- A Figma clone
- A DOM-overlay WYSIWYG editor (like BuilderIO / Plasmic / Webflow)
- A separate design tool with export
- A component library or UI kit

It IS:
- An **overlay** that injects into the user's running React dev server
- A **canvas-rendered** editing surface (selection, spacing handles, badges, drag indicators — all drawn on a single `<canvas>`, not DOM)
- A tool that **writes mutations directly back to the user's source `.tsx` files** via ts-morph AST transforms
- The user's live app, with a thin, fast editing layer glued on top

The core value proposition is **speed and fidelity**: you edit the real app in its real browser runtime, and the changes land in the real source code. No round-trip, no re-implementation, no drift.

---

## The two load-bearing libraries (do not replace these)

From `README.md` — these are deliberately chosen and the whole product depends on them:

1. **[HTML-in-Canvas (`drawElementImage`)](https://developer.chrome.com/blog/html-in-canvas)** — Chrome's experimental Canvas API. Used to paint element previews, badges, labels, and spacing indicators onto the canvas. Falls back to manual canvas drawing when unavailable. **Do not propose replacing the canvas layer with DOM elements.** The canvas IS the USP.
2. **[@chenglou/pretext](https://github.com/chenglou/pretext)** — DOM-free text measurement. Used wherever text is drawn on canvas so we never trigger reflows. Keep using it.

Annotation storage for "Ask AI" history lives in-process: sqlite (WAL mode) at `{projectRoot}/.canvas-data/annotations.db`, served by the editor server at `/__canvas/annotations/*`, exposed to AI agents through MCP tools in `src/mcp/server.ts`. Everything goes through the one editor process — don't add a second HTTP server for annotations.

---

## Architecture (memorize this before editing)

Three cooperating pieces:

1. **HTTP Proxy** (`src/proxy/`) — sits in front of the user's dev server, forwards all requests, injects the overlay script into HTML responses.
2. **Shadow DOM Overlay** (`src/overlay/`) — renders inside an isolated Shadow DOM at `z-index: 2147483647` so the user's app styles never leak in or out. Inside it:
   - A single **canvas layer** (`src/overlay/canvas/paint-frame.ts`) draws selection highlights, spacing badges, resize handles, drag indicators, annotation pins. **Everything visual that tracks an element goes through canvas paint, not DOM.**
   - A **React app** renders the chrome: toolbar, properties panel, context menu, inline text editor, command bar. React handles UI chrome; canvas handles anything that moves with or annotates an element.
   - An **iframe** hosts the target page at breakpoint widths for responsive editing.
3. **WebSocket + ts-morph** (`src/server/`, `src/core/writer/`) — mutations are batched (~150ms), grouped by `file:line`, and applied via ts-morph AST edits to the actual source file. Full undo/redo stack. HMR picks up the file change and the page updates live.

Source mapping: the Babel/Vite plugin injects `data-source-file`, `data-source-line`, `data-source-col` into every JSX element at dev time. `src/core/source-map/resolver.ts` walks up the DOM to find the nearest source location (falls back to React fiber `_debugSource`).

---

## Ports (current)

- **3000** — user's dev server (test app runs here)
- **6966** — Local Canvas editor (single process). Serves the overlay bundle at `/__canvas/*.js`, proxies `/` through to the dev server, hosts the WebSocket for mutations at `/__canvas/ws`, and exposes the annotations + agent-undo HTTP APIs at `/__canvas/annotations/*` and `/__canvas/agent-undo`. Open this port in the browser.

The MCP server (`local-canvas mcp`) is a separate stdio process spawned by the agent client — it talks to `:6966` over HTTP + WebSocket and has no port of its own.

---

## Hard rules for AI agents working on this repo

### Perfect overlay alignment is non-negotiable

The overlay is **painted in the same coordinate space as the iframe content**, deliberately, so that hover/select outlines, spacing badges, and handles land **pixel-perfect** on the underlying elements. This is a core product requirement, not a nice-to-have.

- The overlay canvas lives as a **sibling of the iframe** inside `#responsive-frame-container`, sharing the same CSS transform chain. Do not move the canvas into a different stacking context, a different transform chain, or the top-level window — that reintroduces JS math trying to predict GPU output, which drifts at fractional zoom levels.
- Draws use `element.getBoundingClientRect()` directly (iframe-doc coords) — **no `* zoom`, no `+ offsetX`, no DPR fudging in paint paths**. The canvas context already has `setTransform(dpr, 0, 0, dpr, 0, 0)` applied once at the top of `paintFrame`. If you find yourself multiplying or offsetting rect coords, stop — you are about to misalign the overlay.
- `iframeOffset = { x: 0, y: 0, scale: 1 }` is enforced at the top of `paintFrame` and inside `CanvasOverlayLayer`. Legacy code that reads `iframeOffset.x/y/scale` is effectively a no-op kept for safety during refactors; **do not re-introduce real values there**.
- Hover, selection, resize handles, spacing zones, annotation pins, multi-selection outlines, and flash all share the same rect-math path. If alignment drifts in one, it likely drifts in all — fix the common source, not each call site.
- Before changing anything in `paint-frame.ts`, `CanvasOverlayLayer.tsx`, `ResponsiveFrame.tsx`, or `useViewport.ts`, verify alignment at zoom = 1, 0.5, and 1.5, for elements with sub-pixel widths (e.g. `width: 123.4px`). Drift of even 0.5px is visible and a regression.

#### Coordinate-space gotcha (hover/click pick)

`attachToDocumentAndIframe` attaches a handler to BOTH the main document and the iframe document. The iframe-side listener fires with **iframe-local** `clientX/Y` (no translation by default). `elementAtPoint` and `isClickInsideOverlay` assume **outer-screen/viewport** coords — feeding them iframe-local coords causes `elementAtPoint` to re-translate them as if they were screen coords and pick a completely different element in the iframe-doc (worse at zoom ≠ 1). Symptom: hovering main content highlights an element in the left sidebar.

**Do NOT fix this by turning on `{ translateCoords: true }`** — that wraps the event with `new MouseEvent(...)` which has `target = null`, which breaks the `e.target.ownerDocument !== document` short-circuit inside `isClickInsideOverlay` and causes iframe events to be wrongly classified as overlay chrome (clearing hover).

**Correct pattern**: inside the handler, detect iframe-origin events via `(e.target as Node | null)?.ownerDocument !== document` and bail — `ResponsiveFrame`'s direct iframe-doc listeners (`onMouseMove`, `onClick`, `onContextMenu`) already handle iframe events correctly in iframe-local coords, and the forwarded-to-main-doc mousemove dispatch covers the main-document path. See `handleMouseMove` in `useSelection.ts` for the canonical early return.

The iframe-direct handlers in `ResponsiveFrame.tsx` intentionally work in iframe-local coords — they call `deepElementFromPoint(e.clientX, e.clientY, doc)` directly. Don't "unify" those two paths; they serve different purposes and use different coord spaces on purpose.

### Canvas vs DOM
- **Canvas paint (`paint-frame.ts`, `draw-helpers.ts`) is the hot path.** It runs on every frame when selection/hover/viewport changes. It is dirty-checked (`shouldRepaint`). Do not add per-frame DOM reads, `getBoundingClientRect` on unrelated elements, or React state updates inside it.
- Anything that visually tracks an element (badges, handles, spacing notches, pins, resize grips) belongs on canvas. New UI that anchors to an element should render via the canvas pipeline or as a native-style pin, not as an absolutely-positioned `<div>` chasing coordinates.
- React chrome (toolbar, properties panel, layers panel, context menu) stays in DOM. Do not port it to canvas.

### Mutations go through ts-morph
- Never write a code-mutation path that does string-replace or regex on user source files. All JSX edits go through `src/core/writer/` (`class-modifier.ts`, `style-modifier.ts`, `jsx-modifier.ts`, `reorder.ts`, `component-inserter.ts`).
- Mutations are addressed by `{ filePath, line, column }` resolved from `data-source-*` attrs or React fiber `_debugSource`. Do not invent a new addressing scheme.
- Batching and undo live in `MutationWriter`. Preserve snapshots on every apply.

### Shadow DOM isolation is load-bearing
- Overlay styles must stay inside the Shadow DOM. Do not inject `<style>` tags into the host `<head>` except for the explicit animation-pause stylesheet (`PAUSE_STYLE_ID`) which is intentional and scoped.
- Document-level keyboard handlers need `composedPath()`, not `e.target`, to detect typing inside the Shadow DOM. There is already a memory about this — follow it.

### UI philosophy
- **Native-style over chrome.** Prefer pins, element-anchored controls, and transient overlays. Don't add floating panels for signals that can live on the element itself.
- The canvas editor is the product. The Ask AI flow is a bridge feature — don't let it sprout more panels, history views, or UI that competes for attention with the canvas.

### Annotations / Ask AI flow
- Storage is an in-process sqlite file at `{projectRoot}/.canvas-data/annotations.db`, served at `/__canvas/annotations/*`. No second port, no separate server. Don't reintroduce one.
- Status lifecycle: `pending` (yellow pin) → `in_progress` (blue pulsing pin, set by `annotations_acknowledge`) → `resolved` (green) or `dismissed` (grey). All four statuses ship visuals — pick the right one when touching pin rendering.
- MCP tools live in `src/mcp/server.ts` behind the `local-canvas mcp` CLI subcommand. Agents hook up with `claude mcp add local-canvas -- npx local-canvas mcp` — do not hard-code `dist/mcp/server.js` paths in docs or examples.
- Pins sit at `z-index: 2147483644`, deliberately **below** the canvas overlay layer (`2147483646`), so hover/selection highlights paint on top. The canvas has `pointer-events: none` so clicks still land on pins. Don't raise the pin z-index above the canvas layer.

### Don't

- Don't replace `drawElementImage` usage with DOM clones.
- Don't swap ts-morph for Babel/regex/AST-grep "because it's lighter."
- Don't add backend LLM calls for the Ask AI feature — it routes through the user's own connected MCP agent on purpose (no API keys, full repo context).
- Don't add heavyweight UI dependencies. The stack is Tailwind + Radix primitives + Zustand. Stay minimal.
- Don't convert the overlay React app to SSR, Next.js, or a framework. It's a Vite-built shadow-DOM bundle.
- Don't spawn a second HTTP process for annotations or add a second port. Annotations storage is in-process, same-origin on `:6966`.

---

## Key files

| Path | What it is |
|------|------------|
| `src/overlay/App.tsx` | Overlay root, wires selection/keyboard/viewport hooks |
| `src/overlay/canvas/paint-frame.ts` | The canvas paint loop. Hot path. |
| `src/overlay/canvas/draw-helpers.ts` | Canvas primitives (badges, handles, dashed lines) |
| `src/overlay/components/CanvasOverlayLayer.tsx` | Mounts the canvas and drives paint |
| `src/overlay/components/PropertiesPanel.tsx` | Right-side editor panel (DOM/React) |
| `src/overlay/components/Toolbar.tsx` | Top toolbar, mode switching |
| `src/overlay/hooks/useSelection.ts` | Click-to-select, shift-click, marquee |
| `src/overlay/hooks/useKeyboard.ts` | Global shortcuts (C/N, undo, Space-to-interact, A-to-annotate) |
| `src/overlay/hooks/useWebSocket.ts` | Mutation send/ack |
| `src/core/writer/index.ts` | `MutationWriter` — ts-morph AST edits with undo |
| `src/core/source-map/resolver.ts` | DOM → `{file, line, col}` resolution |
| `src/core/tailwind/parser.ts` | Tailwind class parsing |
| `src/server/index.ts` | WebSocket + HTTP endpoints (including `/__canvas/agent-snapshot` and `/__canvas/annotations/*`) |
| `src/server/annotations-store.ts` | sqlite-backed annotations store (per-project `.canvas-data/annotations.db`) |
| `src/mcp/server.ts` | MCP stdio server exposing canvas_* + annotations_* tools to AI agents |
| `src/cli/index.ts` | `local-canvas dev` / `init` / `mcp` CLI entrypoint |
| `src/overlay/utils/agentation.ts` | Overlay-side annotations client — wraps same-origin `/__canvas/annotations/*` and `/__canvas/agent-undo`. Filename is legacy; content is current. |
| `src/server/agent-undo.ts` | Per-project snapshot ring at `.canvas-undo/snapshots.json` (FIFO, 10 entries), restores files on Undo |
| `src/overlay/components/AnnotationPins.tsx` | Numbered pins, clustering, popover thread UI, drag-to-reposition |
| `src/overlay/components/AskAIHistory.tsx` | History popover in the toolbar (clear-all, hide-all, status dots) |
| `src/proxy/index.ts` | HTTP proxy that injects the overlay |
| `src/plugin/` | Vite + Babel plugins that add `data-source-*` attrs |
| `bin/start.sh` | Starts test app + editor proxy (for local dev of local-canvas itself) |
| `bin/purge-resolved.sh` | Prunes old resolved/dismissed annotations from the per-project sqlite |

---

## Before making changes

1. **Read the file.** Don't guess API shapes — the store is Zustand, canvas uses imperative `CanvasRenderingContext2D`, mutations are typed in `src/server/types.ts`.
2. **Respect the dirty-check.** If you touch `paint-frame.ts`, make sure `shouldRepaint` still catches your new trigger.
3. **Keep the canvas fast.** No new DOM reads per frame. Cache through `getCachedStyle` if you need computed styles.
4. **Match existing conventions.** `.js` extensions on imports (for ESM), no default exports in most modules, tests live in sibling `__tests__` folders using Vitest + Testing Library.
5. **If unsure whether a feature belongs on canvas or in React, ask.** The wrong call here creates drift that's painful to undo.
