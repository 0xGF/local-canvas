import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditorStore } from "../stores/editor-store.js";
import { useElementTree, type TreeNode } from "../hooks/useElementTree.js";
import { resolveSource } from "../../core/source-map/resolver.js";
import { getEditorIframe } from "../utils/iframe-events.js";
import { readFromStorage } from "../utils/persist-state.js";
import { THEME } from "../theme.js";
import {
  ChevronDown, ChevronRight, X, Search,
  Type, Square, Component, Code,
  ImageIcon, Heading1, ListIcon, MousePointerClick, Braces, LinkIcon,
  Loader2,
} from "./icons.js";
const C = THEME;
const EXPAND_KEY = "layers-expanded";

// Accent for component rows — pulls from the shared `canvasLayer` token so
// component highlights, breakpoint badges, and source indicators all share
// one purple across the overlay.
const COMPONENT_COLOR = THEME.canvasLayer;

// Initial row reveal timing. Capped max-delay so a massive tree still finishes
// staggering in well under a second; rows past the cap all land at max-delay.
const REVEAL_STAGGER_MS = 10;
const REVEAL_MAX_DELAY_MS = 350;
const REVEAL_DURATION_MS = 200;

// Grace period before showing the "no source-mapped elements" empty message
// while the iframe is still loading its tree. Anything shorter flashes the
// message on every open; anything longer feels stuck.
const EMPTY_MESSAGE_DELAY_MS = 700;

// ── Row icons by tag ────────────────────────────────────────────────────────
function RowIcon({ tagName, isComponent }: { tagName: string; isComponent: boolean }) {
  const size = 11;
  if (isComponent) {
    return <Component size={size} style={{ color: COMPONENT_COLOR }} />;
  }
  const t = tagName.toLowerCase();
  const color = C.fgDim;

  // SVG / code-ish
  if (t === "svg" || t === "path" || t === "circle" || t === "rect" ||
      t === "polygon" || t === "g") {
    return <Code size={size} style={{ color }} />;
  }
  // Media
  if (t === "img" || t === "picture" || t === "video" || t === "canvas") {
    return <ImageIcon size={size} style={{ color }} />;
  }
  // Headings
  if (t === "h1" || t === "h2" || t === "h3" || t === "h4" || t === "h5" || t === "h6") {
    return <Heading1 size={size} style={{ color }} />;
  }
  // Lists
  if (t === "ul" || t === "ol" || t === "dl") {
    return <ListIcon size={size} style={{ color }} />;
  }
  // Interactive
  if (t === "button") {
    return <MousePointerClick size={size} style={{ color }} />;
  }
  if (t === "input" || t === "textarea" || t === "select") {
    return <Braces size={size} style={{ color }} />;
  }
  if (t === "a") {
    return <LinkIcon size={size} style={{ color }} />;
  }
  // Inline text
  if (t === "p" || t === "span" || t === "label" || t === "li" ||
      t === "strong" || t === "em" || t === "b" || t === "i" || t === "small" ||
      t === "code" || t === "pre") {
    return <Type size={size} style={{ color }} />;
  }
  // Structural containers (div, section, article, main, nav, header, footer, aside, form, etc.)
  return <Square size={size} style={{ color }} />;
}

// ── Flatten tree for rendering + scroll-into-view lookups ───────────────────
interface FlatRow {
  node: TreeNode;
  depth: number;
  visible: boolean;
}

function flatten(nodes: TreeNode[], expanded: Set<string>): FlatRow[] {
  const out: FlatRow[] = [];
  function recurse(ns: TreeNode[], depth: number, parentVisible: boolean) {
    for (const node of ns) {
      out.push({ node, depth, visible: parentVisible });
      const isExpanded = expanded.has(node.path);
      recurse(node.children, depth + 1, parentVisible && isExpanded);
    }
  }
  recurse(nodes, 0, true);
  return out.filter(r => r.visible);
}

/** Walk tree until a node's `element` matches. Returns the node and the
 *  set of ancestor paths that need to be expanded for it to be visible. */
function findNodeForElement(
  nodes: TreeNode[],
  target: HTMLElement | null,
): { node: TreeNode | null; ancestorPaths: string[] } {
  if (!target) return { node: null, ancestorPaths: [] };
  const ancestors: string[] = [];
  function search(ns: TreeNode[], path: string[]): TreeNode | null {
    for (const n of ns) {
      if (n.element === target) {
        ancestors.push(...path);
        return n;
      }
      const hit = search(n.children, [...path, n.path]);
      if (hit) return hit;
    }
    return null;
  }
  const node = search(nodes, []);
  return { node, ancestorPaths: ancestors };
}

// ── Panel ───────────────────────────────────────────────────────────────────
export const LayersPanel = React.memo(function LayersPanel() {
  const open = useEditorStore((s) => s.layersOpen);
  const toggle = useEditorStore((s) => s.toggleLayers);
  const width = useEditorStore((s) => s.layersWidth);
  const setWidth = useEditorStore((s) => s.setLayersWidth);
  const selected = useEditorStore((s) => s.selectedElement);
  const hovered = useEditorStore((s) => s.hoveredElement);
  const setHovered = useEditorStore((s) => s.setHoveredElement);
  const selectElement = useEditorStore((s) => s.selectElement);
  const setContextMenu = useEditorStore((s) => s.setContextMenu);

  const tree = useElementTree(open);

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const saved = readFromStorage<string[]>(EXPAND_KEY);
    return new Set(Array.isArray(saved) ? saved : []);
  });
  const [filter, setFilter] = useState("");

  // Persist expanded set
  useEffect(() => {
    try {
      localStorage.setItem("local-canvas:" + EXPAND_KEY, JSON.stringify([...expanded]));
    } catch { /* quota/private mode */ }
  }, [expanded]);

  const toggleExpanded = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }, []);

  // When selection changes, expand ancestors and scroll into view
  const listRef = useRef<HTMLDivElement | null>(null);
  const selectedPath = useMemo(() => {
    const { node, ancestorPaths } = findNodeForElement(tree, selected?.element ?? null);
    return { path: node?.path ?? null, ancestors: ancestorPaths };
  }, [tree, selected?.element]);

  useEffect(() => {
    if (!selectedPath.path) return;
    setExpanded((prev) => {
      if (selectedPath.ancestors.every(p => prev.has(p))) return prev;
      const next = new Set(prev);
      for (const p of selectedPath.ancestors) next.add(p);
      return next;
    });
  }, [selectedPath.path, selectedPath.ancestors]);

  const hoveredPath = useMemo(() => {
    return findNodeForElement(tree, hovered).node?.path ?? null;
  }, [tree, hovered]);

  // Apply filter: keep nodes whose label/hint match OR whose subtree contains a match
  const filteredTree = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return tree;

    function filterNodes(ns: TreeNode[]): TreeNode[] {
      const out: TreeNode[] = [];
      for (const n of ns) {
        const self =
          n.label.toLowerCase().includes(q) ||
          n.tagName.includes(q) ||
          (n.hint?.toLowerCase().includes(q) ?? false);
        const filteredChildren = filterNodes(n.children);
        if (self || filteredChildren.length > 0) {
          out.push({ ...n, children: filteredChildren });
        }
      }
      return out;
    }
    return filterNodes(tree);
  }, [tree, filter]);

  // Auto-expand everything during an active filter so matches are visible
  const expandedForRender = useMemo(() => {
    if (!filter.trim()) return expanded;
    const all = new Set<string>();
    function collect(ns: TreeNode[]) {
      for (const n of ns) { all.add(n.path); collect(n.children); }
    }
    collect(filteredTree);
    return all;
  }, [filter, filteredTree, expanded]);

  const rows = useMemo(
    () => flatten(filteredTree, expandedForRender),
    [filteredTree, expandedForRender],
  );

  // Initial row reveal — stagger rows in from the top the first time the
  // tree populates after the panel opens. Once the stagger finishes we stop
  // applying the animation so DOM mutations don't re-animate every row.
  const [initialRevealDone, setInitialRevealDone] = useState(false);
  useEffect(() => {
    if (!open) setInitialRevealDone(false);
  }, [open]);
  useEffect(() => {
    if (!open || initialRevealDone || rows.length === 0) return;
    const lastDelay = Math.min((rows.length - 1) * REVEAL_STAGGER_MS, REVEAL_MAX_DELAY_MS);
    const t = window.setTimeout(
      () => setInitialRevealDone(true),
      lastDelay + REVEAL_DURATION_MS + 50,
    );
    return () => window.clearTimeout(t);
  }, [open, rows.length, initialRevealDone]);

  // Delay showing the "no source-mapped elements" fallback so it doesn't
  // flash during the iframe's initial tree-build window.
  const [graceExpired, setGraceExpired] = useState(false);
  useEffect(() => {
    if (!open) { setGraceExpired(false); return; }
    const t = window.setTimeout(() => setGraceExpired(true), EMPTY_MESSAGE_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [open]);
  const isInitialLoading = tree.length === 0 && !graceExpired;

  // Scroll selected row into view (after layout)
  useEffect(() => {
    if (!selectedPath.path || !listRef.current) return;
    const row = listRef.current.querySelector<HTMLElement>(
      `[data-layer-path="${CSS.escape(selectedPath.path)}"]`,
    );
    if (!row) return;
    const listRect = listRef.current.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    if (rowRect.top < listRect.top || rowRect.bottom > listRect.bottom) {
      row.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedPath.path]);

  // ── Resize handle ───────────────────────────────────────────────────────
  const resizeStart = useRef<{ startX: number; startWidth: number } | null>(null);
  const onResizeDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeStart.current = { startX: e.clientX, startWidth: width };

    const onMove = (ev: MouseEvent) => {
      if (!resizeStart.current) return;
      const next = resizeStart.current.startWidth + (ev.clientX - resizeStart.current.startX);
      setWidth(next);
    };
    const onUp = () => {
      resizeStart.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [width, setWidth]);

  // Stable row callbacks — taken as deps by the memoized `Row`, so inline
  // closures would defeat the memo.
  const handleRowSelect = useCallback((node: TreeNode, event: React.MouseEvent) => {
    if (!node.element.isConnected) return;
    const rect = node.element.getBoundingClientRect();
    // Match iframeRef like useSelection does — look up the current iframe if
    // the node lives inside it, otherwise leave undefined.
    const iframe = getEditorIframe();
    const fromIframe = iframe?.contentDocument && node.element.ownerDocument === iframe.contentDocument;
    const source = resolveSource(node.element);
    selectElement({
      element: node.element,
      source,
      rect,
      className: typeof node.element.className === "string" ? node.element.className : "",
      tagName: node.tagName,
      iframeRef: fromIframe ? iframe! : undefined,
    });

    // Any modifier-click opens the context menu: Ctrl or Cmd on either
    // platform, plus right-click / two-finger-click (contextmenu event).
    // The canvas-side pick has the same policy — the original code only
    // accepted Cmd on non-Mac, which meant Cmd-click in the layers panel
    // on macOS silently did nothing.
    const wantsMenu =
      event.ctrlKey ||
      event.metaKey ||
      event.type === "contextmenu";
    if (wantsMenu) {
      event.preventDefault();
      const rowEl = event.currentTarget as HTMLElement;
      const rowRect = rowEl.getBoundingClientRect();
      setContextMenu({
        x: rowRect.right + 4,
        y: rowRect.top,
        element: node.element,
        source,
      });
      return;
    }

    // Reveal on canvas — scroll the target into view inside its own document
    try {
      node.element.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    } catch { /* old browsers */ }
  }, [selectElement, setContextMenu]);

  const handleRowHoverEnter = useCallback((el: HTMLElement) => {
    setHovered(el);
  }, [setHovered]);

  if (!open) return null;

  return (
    <div style={panelStyle(width)} data-canvas-overlay="true" data-canvas-layer-panel="true">
      {/* Header */}
      <div style={headerStyle}>
        <span style={{
          fontSize: 11, fontWeight: 600, color: C.fg, letterSpacing: "0.01em",
        }}>
          Layers
        </span>
        <button
          onClick={toggle}
          title="Close"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 22, height: 22, borderRadius: 4,
            border: "none", background: "transparent",
            color: C.fgDim, cursor: "pointer",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.fg; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.fgDim; }}
        >
          <X size={12} />
        </button>
      </div>

      {/* Filter */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        margin: "6px 8px 8px",
        padding: "5px 8px",
        background: C.bgAlt,
        borderRadius: 6,
      }}>
        <Search size={11} style={{ color: C.fgMuted, flexShrink: 0 }} />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter layers"
          style={{
            flex: 1, border: "none", outline: "none",
            background: "transparent", color: C.fg,
            fontSize: 11, fontFamily: C.font, padding: 0,
          }}
        />
        {filter && (
          <button
            onClick={() => setFilter("")}
            title="Clear"
            style={{
              background: "transparent", border: "none", color: C.fgDim,
              cursor: "pointer", padding: 0, display: "flex", alignItems: "center",
            }}
          >
            <X size={10} />
          </button>
        )}
      </div>

      {/* Tree */}
      <div
        ref={listRef}
        style={{
          flex: 1, overflowY: "auto", overflowX: "hidden",
          padding: "4px 0",
        }}
        onMouseLeave={() => setHovered(null)}
      >
        {rows.length === 0 && (
          isInitialLoading ? (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "32px 14px", color: C.fgMuted,
            }}>
              <Loader2
                size={14}
                style={{ animation: "layerSpin 900ms linear infinite" }}
              />
            </div>
          ) : (
            <div style={{
              padding: "24px 14px", fontSize: 11, color: C.fgMuted,
              textAlign: "center", lineHeight: 1.5,
            }}>
              {tree.length === 0 ? (
                <>
                  <div style={{ color: C.fgDim, marginBottom: 4 }}>
                    No source-mapped elements found.
                  </div>
                  <div style={{ fontSize: 10 }}>
                    Waiting for the preview iframe to load. If this persists, make
                    sure the local-canvas plugin is enabled in your dev config.
                  </div>
                </>
              ) : "No matches."}
            </div>
          )
        )}
        {rows.map((row, index) => {
          const { node, depth } = row;
          const isExpanded = expandedForRender.has(node.path);
          const hasChildren = node.children.length > 0;
          const isSelected = selectedPath.path === node.path;
          const isHovered = hoveredPath === node.path;
          const revealDelay = initialRevealDone
            ? -1
            : Math.min(index * REVEAL_STAGGER_MS, REVEAL_MAX_DELAY_MS);
          return (
            <Row
              key={node.path}
              node={node}
              depth={depth}
              hasChildren={hasChildren}
              isExpanded={isExpanded}
              isSelected={isSelected}
              isHovered={isHovered}
              revealDelay={revealDelay}
              onToggle={toggleExpanded}
              onSelect={handleRowSelect}
              onHoverEnter={handleRowHoverEnter}
            />
          );
        })}
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={onResizeDown}
        style={{
          position: "absolute", top: 0, right: -3, bottom: 0, width: 6,
          cursor: "col-resize", zIndex: 1,
        }}
        title="Drag to resize"
      />
    </div>
  );
});

// ── Row ─────────────────────────────────────────────────────────────────────
interface RowProps {
  node: TreeNode;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  isHovered: boolean;
  /** Stagger delay in ms for the initial reveal; -1 disables the animation. */
  revealDelay: number;
  onToggle: (path: string) => void;
  onSelect: (node: TreeNode, event: React.MouseEvent) => void;
  onHoverEnter: (el: HTMLElement) => void;
}

const Row = React.memo(function Row({
  node, depth, hasChildren, isExpanded, isSelected, isHovered, revealDelay,
  onToggle, onSelect, onHoverEnter,
}: RowProps) {
  const background = isSelected
    ? "rgba(12,140,233,0.16)"
    : isHovered
    ? "rgba(255,255,255,0.04)"
    : "transparent";

  return (
    <div
      data-layer-path={node.path}
      onClick={(e) => onSelect(node, e)}
      // Right-click behaves like a Ctrl+click on the canvas — same menu
      onContextMenu={(e) => { e.preventDefault(); onSelect(node, e); }}
      onMouseEnter={() => onHoverEnter(node.element)}
      style={{
        position: "relative",
        display: "flex", alignItems: "center", gap: 6,
        paddingLeft: 10 + depth * 14, paddingRight: 10,
        height: 26, cursor: "pointer",
        background, color: C.fg,
        transition: "background 80ms linear",
        ...(revealDelay >= 0 && {
          animation: `layerRowReveal ${REVEAL_DURATION_MS}ms ease-out both`,
          animationDelay: `${revealDelay}ms`,
        }),
      }}
    >
      {/* Selected indicator — inset, doesn't shift layout */}
      {isSelected && (
        <span style={{
          position: "absolute", left: 0, top: 4, bottom: 4, width: 2,
          background: C.accent, borderRadius: "0 2px 2px 0",
        }} />
      )}
      {hasChildren ? (
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(node.path); }}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 14, height: 14, padding: 0, marginLeft: -2,
            background: "transparent", border: "none",
            color: C.fgDim, cursor: "pointer", flexShrink: 0,
            borderRadius: 3,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = C.fg; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = C.fgDim; }}
        >
          {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        </button>
      ) : (
        <span style={{ width: 12, flexShrink: 0 }} />
      )}
      <RowIcon tagName={node.tagName} isComponent={node.isComponent} />
      <span style={{
        fontSize: 11, fontFamily: C.font,
        fontWeight: node.isComponent ? 600 : isSelected ? 600 : 500,
        color: node.isComponent ? COMPONENT_COLOR : C.fg,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        flexShrink: 0,
      }}>
        {node.label}
      </span>
      {node.hint && (
        <span style={{
          fontSize: 11, fontFamily: C.font, color: C.fgMuted,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          flex: 1, minWidth: 0, textAlign: "right",
        }}>
          {node.hint}
        </span>
      )}
    </div>
  );
});

// ── Styles ──────────────────────────────────────────────────────────────────
function panelStyle(width: number): React.CSSProperties {
  return {
    position: "fixed", top: 8, left: 8, bottom: 8, width,
    background: C.bg, border: `1px solid ${C.border}`,
    borderRadius: 10, boxShadow: "0 8px 40px rgba(0,0,0,0.45)",
    overflow: "visible", display: "flex", flexDirection: "column",
    pointerEvents: "auto", fontFamily: C.font, fontSize: 11,
    color: C.fg, WebkitFontSmoothing: "antialiased", userSelect: "none",
    zIndex: 2147483647,
    animation: "canvasPanelSlideInLeft 260ms cubic-bezier(0.16, 1, 0.3, 1) both",
  };
}

const headerStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "10px 12px 4px",
};
