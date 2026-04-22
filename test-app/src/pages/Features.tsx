export default function Features() {
  return (
    <div className="max-w-[680px] px-6 pt-12 pb-16 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-3">Features</h1>
        <p className="text-[15px] text-neutral-500 leading-relaxed">
          What the overlay actually does, grouped by what you reach for first.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Two modes</h2>
        <ul className="list-disc pl-5 text-[14px] text-neutral-600 space-y-2 leading-relaxed">
          <li>
            <strong className="text-neutral-800">Canvas (C)</strong> — click to
            select, drag handles to resize/pad/margin, pan and zoom with
            trackpad. Your app is "frozen" under the overlay.
          </li>
          <li>
            <strong className="text-neutral-800">Navigate (N)</strong> — overlay
            steps aside, the app is fully interactive (open modals, submit
            forms, navigate).
          </li>
          <li>
            <strong className="text-neutral-800">Interact mode (hold Space)</strong> —
            a temporary pass-through while staying in canvas mode. Release Space
            to return to editing.
          </li>
        </ul>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Selection</h2>
        <ul className="list-disc pl-5 text-[14px] text-neutral-600 space-y-2 leading-relaxed">
          <li>Click any element to select it. Hover shows a live outline.</li>
          <li><strong className="text-neutral-800">Escape</strong> walks up the DOM tree one parent at a time (Figma-style). At the top, Escape deselects.</li>
          <li><strong className="text-neutral-800">Shift+click</strong> adds / removes elements from a multi-selection.</li>
          <li><strong className="text-neutral-800">Alt+drag</strong> marquees a rectangle to select everything under it.</li>
          <li>Click resolution uses <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">elementsFromPoint</code> and skips structural wrappers (<code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">html</code>, <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">body</code>, <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">#root</code>, <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">#__next</code>).</li>
        </ul>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Spacing handles</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          Selected elements show drag handles on every edge for margin and
          padding. Elements with zero spacing show small dashed grab-notches —
          drag from zero to start adding margin or padding directly, no need to
          open the panel. Values snap to the Tailwind spacing scale; off-scale
          values become arbitrary (<code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">p-[13px]</code>).
        </p>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          Drag deltas are divided by the current zoom, so adjustment stays
          accurate at 50% or 150% zoom.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Resize grips</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          Eight grips — four corners and four edges — with cursor hints. Drag
          to adjust width/height; values are written as{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">w-[Npx]</code>{" "}
          /{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">h-[Npx]</code>{" "}
          with snap-to-scale on release where possible.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Drag-to-scrub numeric inputs</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          Every numeric input in the properties panel supports label-drag:
          hover the label, click-and-drag up/down to increment/decrement. Hold
          Shift for fine adjustment. Commits land as clean mutations with a
          smooth handoff back to HMR.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Inline text editing</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          Double-click any element with direct text content to edit in place.
          Enter commits, Escape cancels. The change lands as a{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">modify-text</code>{" "}
          mutation. Elements that only wrap children (no direct text) are
          skipped.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Ask AI (annotations)</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          Press <strong>A</strong> to enter annotate mode, or pick "Ask AI" from
          the context menu. Click an element, type a prompt, and the overlay
          POSTs an annotation — element path, current classes, bounding box,
          your comment — to the local sqlite store. Your connected MCP agent
          picks it up via <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">annotations_list_pending</code>,
          makes the edits, and replies on the thread.
        </p>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          Annotations render as numbered pins that auto-pick the best corner,
          cluster when dense, and pulse blue while an agent is working on them.
          Status lifecycle:{" "}
          <strong className="text-neutral-800">pending</strong> (yellow) →{" "}
          <strong className="text-neutral-800">in&nbsp;progress</strong> (blue, pulsing) →{" "}
          <strong className="text-neutral-800">resolved</strong> (green) or{" "}
          <strong className="text-neutral-800">dismissed</strong> (grey).
        </p>
        <p className="text-[14px] text-neutral-500 leading-relaxed">
          No API keys. No backend LLM calls. The agent is your own — Claude
          Code, Cursor, anything that speaks MCP.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Multi-element annotations</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          Shift-click multiple elements, then annotate — the annotation's{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">elementPaths[]</code>{" "}
          carries all of them. Resolving the annotation once covers the whole
          group. For edits that span multiple files, the agent bundles every
          affected file into a single{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">/__canvas/agent-snapshot</code>{" "}
          call so one Undo restores them together.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Layers panel</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          Press <strong>L</strong> to open. Shows the source-mapped JSX tree,
          reveals with a staggered animation, lets you filter by tag or text,
          click to select, and drag to reorder (the reorder goes through the
          same ts-morph mutation path as any other edit).
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Breakpoint previews</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          Switch the iframe width to mobile, tablet, laptop, desktop, or a
          custom value —{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">@media</code>{" "}
          queries fire at the correct breakpoint. When a breakpoint is active,
          class writes are prefixed automatically (<code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">md:p-4</code>{" "}
          instead of <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">p-4</code>),
          so you edit responsive styles the same way you edit default ones.
        </p>
        <p className="text-[14px] text-neutral-500 leading-relaxed">
          The iframe loads with{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">?__canvas_no_overlay=1</code>{" "}
          to prevent nested overlay injection.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Animation pause</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          <strong>Alt+P</strong> freezes every CSS animation and transition on
          the page so you can inspect mid-state. Works via a scoped stylesheet
          injection into the target document — the only{" "}
          <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">&lt;style&gt;</code>{" "}
          we add outside the Shadow DOM, and intentionally so.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Undo with HMR awareness</h2>
        <p className="text-[14px] text-neutral-600 leading-relaxed">
          Every mutation snapshots file contents before applying. <strong>⌘Z</strong>{" "}
          / <strong>⌘⇧Z</strong> restores the snapshot, waits briefly for HMR,
          then re-selects the element at its new position — handy after
          reorders. Agent-driven edits get their own undo entries in the Ask AI
          history row via <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">/__canvas/agent-undo</code>.
        </p>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Changes panel &amp; diff view</h2>
        <ul className="list-disc pl-5 text-[14px] text-neutral-600 space-y-2 leading-relaxed">
          <li>
            The <strong className="text-neutral-800">Save</strong> button in the
            bottom bar doubles as a pending-changes counter. Click it to open a
            popover listing every queued mutation with its file path, line
            number, status (pending / applied / failed) and time.
          </li>
          <li>
            Each change expands to a unified{" "}
            <strong className="text-neutral-800">diff</strong> of the actual
            source edit — red <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">-</code>{" "}
            / green <code className="text-[12px] bg-neutral-100 px-1 py-0.5 rounded">+</code>{" "}
            lines of the JSX that got rewritten. Useful when a Tailwind edit
            lands in a surprising place and you want to verify it before
            hitting <strong>⌘S</strong>.
          </li>
          <li>
            A <strong className="text-neutral-800">Discard Changes</strong>{" "}
            trash button sits next to Save with a confirm popover — wipes every
            pending mutation without touching files that have already been
            written.
          </li>
          <li>
            Toolbar popups (Settings, Breakpoint, History, Save) are{" "}
            <strong className="text-neutral-800">mutually exclusive</strong> —
            opening one closes the others, so you never end up with
            overlapping panels.
          </li>
        </ul>
      </div>
    </div>
  );
}
