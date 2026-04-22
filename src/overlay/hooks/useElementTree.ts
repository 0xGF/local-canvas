import { useEffect, useRef, useState } from "react";
import { getIframeDocument, getEditorIframe } from "../utils/iframe-events.js";

/**
 * A single row in the layers tree. Represents a source-mapped DOM element.
 * Intermediate (non-source-mapped) DOM nodes are flattened out — children are
 * attached to their nearest source-mapped ancestor.
 */
export interface TreeNode {
  /** Stable key: sourceFile + ":" + sourceLine. Multiple DOM nodes may share a
   *  key when they come from the same JSX location (e.g. list rendering). */
  key: string;
  element: HTMLElement;
  tagName: string;
  /** Short human label — component name (from file basename) or tag name. */
  label: string;
  /** Optional subtitle — first class token or short text preview. */
  hint: string | null;
  /** True when this row represents a component boundary (file changed from
   *  the parent). Used to style the row differently (purple icon + label). */
  isComponent: boolean;
  sourceFile: string;
  sourceLine: number;
  /** Path from the root, used as React key so repeated `key`s don't collide. */
  path: string;
  children: TreeNode[];
}

/**
 * Extract an element's OWN source location (not an ancestor's).
 * Primary path: `data-source-file` + `data-source-line` attributes injected by
 * the babel/SWC transform. Fallback path: React fiber's `_debugSource` —
 * supports dev builds without our transform (e.g. plain CRA / Next.js dev).
 */
function getOwnSource(el: HTMLElement): { file: string; line: number } | null {
  const file = el.dataset.sourceFile;
  const line = el.dataset.sourceLine;
  if (file && line) {
    const n = parseInt(line, 10);
    if (!isNaN(n)) return { file, line: n };
  }

  // Fiber fallback — only the element's OWN fiber, don't walk up
  const fiberKey = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
  if (!fiberKey) return null;

  interface Fiber { _debugSource?: { fileName: string; lineNumber: number } }
  const fiber = (el as unknown as Record<string, Fiber>)[fiberKey];
  const src = fiber?._debugSource;
  if (src?.fileName && typeof src.lineNumber === "number") {
    return { file: src.fileName, line: src.lineNumber };
  }
  return null;
}

/**
 * Walk up the fiber tree looking for the nearest component (function/class)
 * fiber whose `_debugSource` is in a DIFFERENT file than `ownSource`. That
 * fiber's source is the call site — where the user's parent file wrote
 * `<Component />`. Returns null on no-fiber / no-match.
 *
 * Used to route Layers-panel selection of a component row to its JSX call
 * (e.g. `Overview.tsx:23`) instead of the component's internal element
 * (`LoopingClip.tsx:52`). Editing the call site affects only that instance;
 * editing the internal element propagates to every usage.
 */
interface Fiber {
  type?: unknown;
  return?: Fiber;
  _debugSource?: { fileName: string; lineNumber: number };
}
function getCallSiteSource(el: HTMLElement, ownFile: string): { file: string; line: number } | null {
  const fiberKey = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
  if (!fiberKey) return null;
  let fiber: Fiber | undefined = (el as unknown as Record<string, Fiber>)[fiberKey];
  while (fiber) {
    // Component fiber: function (FC) or class (prototype.isReactComponent).
    // Host fibers (div, span, etc.) have string `type`.
    const isComponent = typeof fiber.type === "function";
    if (isComponent) {
      const src = fiber._debugSource;
      if (src?.fileName && typeof src.lineNumber === "number" && src.fileName !== ownFile) {
        return { file: src.fileName, line: src.lineNumber };
      }
    }
    fiber = fiber.return;
  }
  return null;
}

/**
 * Walk the document and produce a flattened tree of source-mapped elements.
 * Elements without source data collapse their children up to the nearest
 * source-mapped ancestor, so the tree shows only editable nodes.
 */
function buildTree(root: Document | HTMLElement): TreeNode[] {
  const body = root instanceof Document ? root.body : root;
  if (!body) return [];

  const rootChildren: TreeNode[] = [];

  // Walk the DOM. When we hit a source-mapped element, make it a node; its
  // children are walked with that node as their parent. Non-source-mapped
  // elements pass through — their children are attached to the same parent.
  //
  // `parentFile` tracks the source file of the enclosing mapped ancestor so we
  // can tell whether a new node is the ROOT of a component boundary (file
  // changed) or just an internal JSX element inside the same component.
  function walk(
    element: Element,
    parent: TreeNode | null,
    parentPath: string,
    parentFile: string | null,
  ) {
    for (const child of Array.from(element.children)) {
      // CRITICAL: don't use `child instanceof HTMLElement` here — it returns
      // `false` for elements inside the iframe because they're instances of
      // the iframe realm's `HTMLElement` class, not the parent realm's.
      // Use Node.ELEMENT_NODE (1) instead and cast.
      if (child.nodeType !== 1) continue;
      const htmlChild = child as HTMLElement;

      // Skip overlay-injected nodes (defensive — iframe body shouldn't have them)
      if (htmlChild.dataset?.canvasOverlay === "true") continue;
      if (htmlChild.tagName === "SCRIPT" || htmlChild.tagName === "STYLE") continue;

      const src = getOwnSource(htmlChild);

      if (src) {
        const isComponentRoot = src.file !== parentFile;
        // For component-boundary rows, prefer the CALL SITE source (where
        // `<Component />` was written in the parent file) over the
        // component's internal source. This lets Layers-panel "delete" on
        // a `<LoopingClip/>` row remove just that call instead of deleting
        // the <video> template shared by every instance.
        const callSite = isComponentRoot ? getCallSiteSource(htmlChild, src.file) : null;
        const nodeFile = callSite?.file ?? src.file;
        const nodeLine = callSite?.line ?? src.line;
        const node = makeNode(
          htmlChild, nodeFile, nodeLine, parentPath,
          parent?.children.length ?? rootChildren.length,
          isComponentRoot,
        );
        (parent ? parent.children : rootChildren).push(node);
        walk(htmlChild, node, node.path, src.file);
      } else {
        // Transparent — keep walking with the same parent
        walk(htmlChild, parent, parentPath, parentFile);
      }
    }
  }

  walk(body, null, "", null);
  return rootChildren;
}

function makeNode(
  el: HTMLElement,
  file: string,
  line: number,
  parentPath: string,
  index: number,
  isComponentRoot: boolean,
): TreeNode {
  const tagName = el.tagName.toLowerCase();
  // Use the component name only at the component boundary. Inside the same
  // component, label by tag so siblings aren't all "Hero".
  const componentName = isComponentRoot ? componentNameFromFile(file) : null;
  const label = componentName ?? tagName;
  return {
    key: `${file}:${line}`,
    element: el,
    tagName,
    label,
    // Only flag as a component if we actually derived a component name —
    // a lowercase `page.tsx` boundary still isn't a "component" row.
    isComponent: componentName !== null,
    hint: hintFor(el),
    sourceFile: file,
    sourceLine: line,
    path: parentPath ? `${parentPath}/${index}` : String(index),
    children: [],
  };
}

/** Pull a PascalCase-looking basename out of a source file path.
 *  "src/app/Hero.tsx" → "Hero"; lowercase/kebab filenames → null (fall back to tag). */
function componentNameFromFile(file: string): string | null {
  const base = file.split("/").pop() ?? "";
  const name = base.replace(/\.(tsx|jsx|ts|js)$/i, "");
  if (!name) return null;
  // Treat as a component name only when the first char is uppercase — avoids
  // labeling every element in `page.tsx` as "Page".
  if (/^[A-Z]/.test(name)) return name;
  return null;
}

/** Short hint: truncated text preview for leaf elements.
 *  (We intentionally don't surface className — one random class like ".mx-auto"
 *  out of a 10-class Tailwind list is noise, not signal.) */
function hintFor(el: HTMLElement): string | null {
  const hasChildren = el.children.length > 0;
  if (hasChildren) return null;
  const text = (el.textContent ?? "").trim();
  if (!text) return null;
  if (text.length <= 40) return text;
  return text.slice(0, 40) + "…";
}

/**
 * Observes the iframe document and returns the current element tree.
 *
 * The iframe's lifecycle is tricky: its element may not exist when we mount
 * (navigate→edit mode), its contentDocument may be `about:blank` during the
 * initial load, and it's fully remounted on breakpoint changes. To handle all
 * of these:
 *
 * 1. Poll every 250ms for the iframe element and re-attach when it changes
 *    (covers mode switches + breakpoint remounts).
 * 2. Listen to the iframe's `load` event so we re-attach the MutationObserver
 *    the *instant* a new document is installed — no 250ms gap.
 * 3. Rebuild on DOM mutations (RAF-debounced) once attached.
 */
export function useElementTree(enabled: boolean): TreeNode[] {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const observerRef = useRef<MutationObserver | null>(null);
  const observedDocRef = useRef<Document | null>(null);
  const rebuildRafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setTree([]);
      return;
    }

    // `undefined` sentinel means "no attempt yet"; `null` means "no iframe
    // present, but we've already observed the fallback document". This
    // distinction matters for the very first call: if `boundIframe === null`
    // started life equal to `getEditorIframe()`'s null, we'd skip the initial
    // observer attachment and the tree would stay empty.
    let boundIframe: HTMLIFrameElement | null | undefined = undefined;

    function scheduleRebuild() {
      if (rebuildRafRef.current !== null) return;
      rebuildRafRef.current = requestAnimationFrame(() => {
        rebuildRafRef.current = null;
        const doc = getIframeDocument() ?? document;
        setTree(buildTree(doc));
      });
    }

    /** Re-observe the current target document. Safe to call multiple times. */
    function reattachObserver() {
      const doc = getIframeDocument() ?? document;
      // Always re-attach — the document reference changes after iframe nav
      // even when the iframe element is the same. Cheap to re-attach anyway.
      observerRef.current?.disconnect();
      observedDocRef.current = doc;

      setTree(buildTree(doc));

      observerRef.current = new MutationObserver(scheduleRebuild);
      try {
        observerRef.current.observe(doc.body ?? doc, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["data-source-file", "data-source-line", "class"],
        });
      } catch {
        // Document not ready yet — the poll below will catch it
      }
    }

    function onIframeLoad() {
      // New document just installed into the iframe — re-observe it
      reattachObserver();
    }

    /** Keep `boundIframe` pointed at the current iframe element; hook its
     *  load event so we catch navigations instantly. Also re-observe when the
     *  iframe's *contentDocument* changes while the element stays the same —
     *  this covers the about:blank → loaded-doc swap that happens between
     *  LayersPanel mount and the iframe's first `load` event. Without this,
     *  a race where the load event fires before our listener is registered
     *  leaves the observer stuck on the old doc and the tree empty forever. */
    function rebindIframe() {
      const iframe = getEditorIframe();
      if (iframe !== boundIframe) {
        if (boundIframe) boundIframe.removeEventListener("load", onIframeLoad);
        boundIframe = iframe;
        if (iframe) iframe.addEventListener("load", onIframeLoad);
        reattachObserver();
        return;
      }
      // Same iframe element — but did its contentDocument swap under us?
      const currentDoc = getIframeDocument() ?? document;
      if (currentDoc !== observedDocRef.current) {
        reattachObserver();
      }
    }

    rebindIframe();
    const poll = setInterval(rebindIframe, 250);

    return () => {
      clearInterval(poll);
      if (boundIframe) boundIframe.removeEventListener("load", onIframeLoad);
      observerRef.current?.disconnect();
      observerRef.current = null;
      observedDocRef.current = null;
      if (rebuildRafRef.current !== null) {
        cancelAnimationFrame(rebuildRafRef.current);
        rebuildRafRef.current = null;
      }
    };
  }, [enabled]);

  return tree;
}
