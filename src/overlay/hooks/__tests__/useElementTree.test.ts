import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

// No iframe in jsdom — hook falls back to main `document`.
vi.mock("../../utils/iframe-events.js", () => ({
  getIframeDocument: vi.fn().mockReturnValue(null),
  getEditorIframe: vi.fn().mockReturnValue(null),
}));

import { useElementTree } from "../useElementTree.js";

/** Element with source-map attributes. */
function se(
  tag: string,
  file: string,
  line: number,
  children: (HTMLElement | string)[] = [],
  extraAttrs: Record<string, string> = {},
): HTMLElement {
  const el = document.createElement(tag);
  el.setAttribute("data-source-file", file);
  el.setAttribute("data-source-line", String(line));
  for (const [k, v] of Object.entries(extraAttrs)) el.setAttribute(k, v);
  for (const c of children) {
    el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return el;
}

/** Plain element (no source attrs). */
function el(tag: string, children: (HTMLElement | string)[] = [], attrs: Record<string, string> = {}): HTMLElement {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const c of children) {
    e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return e;
}

const rafTick = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

describe("useElementTree", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("returns an empty tree when disabled", () => {
    document.body.appendChild(se("div", "src/Hero.tsx", 1));
    const { result } = renderHook(() => useElementTree(false));
    expect(result.current).toEqual([]);
  });

  it("builds a tree of source-mapped elements", () => {
    document.body.appendChild(
      se("div", "src/Hero.tsx", 1, [
        se("h1", "src/Hero.tsx", 5, ["Hello"]),
        se("p", "src/Hero.tsx", 7, ["World"]),
      ]),
    );

    const { result } = renderHook(() => useElementTree(true));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].label).toBe("Hero");
    expect(result.current[0].tagName).toBe("div");
    expect(result.current[0].children.map((c) => c.tagName)).toEqual(["h1", "p"]);
  });

  it("flattens non-mapped intermediate wrappers up to their nearest mapped ancestor", () => {
    const h1 = se("h1", "src/Hero.tsx", 5);
    const wrapper = el("div", [h1]); // not source-mapped
    const root = se("div", "src/Hero.tsx", 1, [wrapper]);
    document.body.appendChild(root);

    const { result } = renderHook(() => useElementTree(true));
    expect(result.current).toHaveLength(1);
    // h1 should be a direct child of root, bypassing the wrapper
    expect(result.current[0].children).toHaveLength(1);
    expect(result.current[0].children[0].tagName).toBe("h1");
    expect(result.current[0].children[0].element).toBe(h1);
  });

  it("labels rows with the PascalCase component name when the filename starts uppercase", () => {
    document.body.appendChild(se("section", "components/Navbar.tsx", 1));
    const { result } = renderHook(() => useElementTree(true));
    expect(result.current[0].label).toBe("Navbar");
    expect(result.current[0].tagName).toBe("section");
  });

  it("falls back to the tag name when the filename is lowercase (page.tsx)", () => {
    document.body.appendChild(se("div", "src/pages/index.tsx", 1));
    const { result } = renderHook(() => useElementTree(true));
    // Must not label every element in `index.tsx` as "Index"
    expect(result.current[0].label).toBe("div");
  });

  it("preserves live element references so clicks can select them", () => {
    const h1 = se("h1", "src/Hero.tsx", 5);
    document.body.appendChild(se("div", "src/Hero.tsx", 1, [h1]));

    const { result } = renderHook(() => useElementTree(true));
    expect(result.current[0].children[0].element).toBe(h1);
    expect(result.current[0].children[0].element.isConnected).toBe(true);
  });

  it("skips subtrees tagged as overlay (data-canvas-overlay)", () => {
    document.body.appendChild(se("div", "src/Hero.tsx", 1));
    // Overlay-tagged wrapper containing a source-mapped descendant
    document.body.appendChild(
      el("div", [se("div", "src/Overlay.tsx", 1)], { "data-canvas-overlay": "true" }),
    );

    const { result } = renderHook(() => useElementTree(true));
    expect(result.current.map((n) => n.label)).toEqual(["Hero"]);
  });

  it("skips <script> and <style> elements", () => {
    document.body.appendChild(se("div", "src/Hero.tsx", 1));
    // <script>/<style> can carry source attrs in some pipelines — still skip
    document.body.appendChild(se("script", "src/App.tsx", 1));
    document.body.appendChild(se("style", "src/App.tsx", 2));

    const { result } = renderHook(() => useElementTree(true));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].label).toBe("Hero");
  });

  it("gives each node a unique path key (stable for React reconciliation)", () => {
    document.body.appendChild(
      se("div", "src/Hero.tsx", 1, [
        se("h1", "src/Hero.tsx", 5),
        se("p", "src/Hero.tsx", 7),
      ]),
    );
    const { result } = renderHook(() => useElementTree(true));
    const root = result.current[0];
    expect(root.path).toBe("0");
    expect(root.children[0].path).toBe("0/0");
    expect(root.children[1].path).toBe("0/1");
  });

  it("does NOT surface className as a hint (one random class is noise in Tailwind apps)", () => {
    const div = se("div", "src/Hero.tsx", 1);
    div.className = "flex items-center gap-2 bg-white hover:bg-zinc-50";
    document.body.appendChild(div);

    const { result } = renderHook(() => useElementTree(true));
    expect(result.current[0].hint).toBeNull();
  });

  it("derives a text-preview hint for leaf elements with short text", () => {
    const p = se("p", "src/Hero.tsx", 1, ["Hello world"]);
    document.body.appendChild(p);

    const { result } = renderHook(() => useElementTree(true));
    expect(result.current[0].hint).toBe("Hello world");
  });

  it("truncates long text-preview hints", () => {
    const longText = "x".repeat(80);
    const p = se("p", "src/Hero.tsx", 1, [longText]);
    document.body.appendChild(p);

    const { result } = renderHook(() => useElementTree(true));
    expect(result.current[0].hint).toMatch(/…$/);
    expect(result.current[0].hint!.length).toBe(41); // 40 chars + ellipsis
  });

  it("flags component-root nodes with isComponent=true", () => {
    document.body.appendChild(
      se("section", "src/Navbar.tsx", 1, [
        se("h1", "src/Navbar.tsx", 5, ["Logo"]),
      ]),
    );
    const { result } = renderHook(() => useElementTree(true));
    expect(result.current[0].isComponent).toBe(true); // Navbar component root
    expect(result.current[0].children[0].isComponent).toBe(false); // h1 inside same file
  });

  it("does NOT flag lowercase-filename boundaries as components", () => {
    // `index.tsx` / `page.tsx` don't represent a named component — don't paint them purple
    document.body.appendChild(se("div", "src/pages/index.tsx", 1));
    const { result } = renderHook(() => useElementTree(true));
    expect(result.current[0].isComponent).toBe(false);
  });

  it("rebuilds the tree when a new source-mapped element is added", async () => {
    document.body.appendChild(se("div", "src/Hero.tsx", 1));
    const { result } = renderHook(() => useElementTree(true));
    expect(result.current).toHaveLength(1);

    await act(async () => {
      document.body.appendChild(se("div", "src/Footer.tsx", 1));
      // MutationObserver callback fires microtask-async, then hook RAF-throttles
      await rafTick();
      await rafTick();
    });

    expect(result.current.map((n) => n.label)).toEqual(["Hero", "Footer"]);
  });

  it("rebuilds the tree when a source-mapped element is removed", async () => {
    const hero = se("div", "src/Hero.tsx", 1);
    const footer = se("div", "src/Footer.tsx", 1);
    document.body.appendChild(hero);
    document.body.appendChild(footer);

    const { result } = renderHook(() => useElementTree(true));
    expect(result.current).toHaveLength(2);

    await act(async () => {
      footer.remove();
      await rafTick();
      await rafTick();
    });

    expect(result.current.map((n) => n.label)).toEqual(["Hero"]);
  });

  it("picks up iframe contents when the iframe's load event fires", async () => {
    const { getEditorIframe, getIframeDocument } = await import("../../utils/iframe-events.js");
    const iframeDoc = document.implementation.createHTMLDocument("test");
    const iframe = document.createElement("iframe");
    vi.mocked(getEditorIframe).mockReturnValue(iframe);
    vi.mocked(getIframeDocument).mockReturnValue(iframeDoc);

    const { result } = renderHook(() => useElementTree(true));
    expect(result.current).toHaveLength(0);

    iframeDoc.body.appendChild(
      (() => {
        const el = iframeDoc.createElement("div");
        el.setAttribute("data-source-file", "src/App.tsx");
        el.setAttribute("data-source-line", "1");
        return el;
      })(),
    );

    await act(async () => {
      iframe.dispatchEvent(new Event("load"));
      await rafTick();
    });

    expect(result.current).toHaveLength(1);
    expect(result.current[0].label).toBe("App");

    vi.mocked(getEditorIframe).mockReturnValue(null);
    vi.mocked(getIframeDocument).mockReturnValue(null);
  });

  /**
   * The REAL-WORLD timing: iframe loads an empty HTML shell, fires `load`,
   * THEN React mounts client-side and injects elements. The mutation observer
   * attached after `load` must catch those async React renders. This is the
   * scenario the user was hitting where the tree stayed empty forever.
   */
  it("picks up elements that React appends AFTER the iframe load event fires", async () => {
    const { getEditorIframe, getIframeDocument } = await import("../../utils/iframe-events.js");
    const iframeDoc = document.implementation.createHTMLDocument("test");
    const iframe = document.createElement("iframe");
    vi.mocked(getEditorIframe).mockReturnValue(iframe);
    vi.mocked(getIframeDocument).mockReturnValue(iframeDoc);

    const { result } = renderHook(() => useElementTree(true));

    // Load fires with an empty iframe body (just an empty <div id="root">)
    const rootDiv = iframeDoc.createElement("div");
    rootDiv.id = "root";
    iframeDoc.body.appendChild(rootDiv);

    await act(async () => {
      iframe.dispatchEvent(new Event("load"));
      await rafTick();
    });
    // Tree is empty at this point — React hasn't mounted yet
    expect(result.current).toHaveLength(0);

    // Simulate React finishing its first render, appending source-mapped nodes
    await act(async () => {
      const el = iframeDoc.createElement("div");
      el.setAttribute("data-source-file", "src/App.tsx");
      el.setAttribute("data-source-line", "1");
      rootDiv.appendChild(el);
      // MutationObserver → microtask → RAF debounce → setTree
      await rafTick();
      await rafTick();
    });

    expect(result.current).toHaveLength(1);
    expect(result.current[0].label).toBe("App");

    vi.mocked(getEditorIframe).mockReturnValue(null);
    vi.mocked(getIframeDocument).mockReturnValue(null);
  });

  /**
   * Regression test for the cross-realm instanceof bug: elements inside an
   * iframe are instances of the iframe realm's HTMLElement, NOT the parent
   * realm's. `child instanceof HTMLElement` returns false and the walker
   * skips everything. This uses a real jsdom iframe so the cross-realm check
   * is actually exercised.
   */
  it("walks elements that live inside an iframe (cross-realm nodes)", async () => {
    const { getEditorIframe, getIframeDocument } = await import("../../utils/iframe-events.js");
    const iframeEl = document.createElement("iframe");
    document.body.appendChild(iframeEl);
    // jsdom provides a real contentDocument with its own realm
    const innerDoc = iframeEl.contentDocument!;
    // Build a realistic body: #root > Layout (source-mapped)
    const root = innerDoc.createElement("div");
    root.id = "root";
    const layout = innerDoc.createElement("div");
    layout.setAttribute("data-source-file", "src/Layout.tsx");
    layout.setAttribute("data-source-line", "1");
    const inner = innerDoc.createElement("h1");
    inner.setAttribute("data-source-file", "src/Layout.tsx");
    inner.setAttribute("data-source-line", "5");
    inner.textContent = "Hi";
    layout.appendChild(inner);
    root.appendChild(layout);
    innerDoc.body.appendChild(root);

    vi.mocked(getEditorIframe).mockReturnValue(iframeEl);
    vi.mocked(getIframeDocument).mockReturnValue(innerDoc);

    const { result } = renderHook(() => useElementTree(true));
    await act(async () => {
      iframeEl.dispatchEvent(new Event("load"));
      await rafTick();
    });

    // This would be [] if the walker used `instanceof HTMLElement` instead of
    // `nodeType === 1`, because iframe elements are a different class.
    expect(result.current).toHaveLength(1);
    expect(result.current[0].label).toBe("Layout");
    expect(result.current[0].children).toHaveLength(1);
    expect(result.current[0].children[0].tagName).toBe("h1");

    vi.mocked(getEditorIframe).mockReturnValue(null);
    vi.mocked(getIframeDocument).mockReturnValue(null);
    iframeEl.remove();
  });

  /**
   * Initial-mount race: the LayersPanel mounts with the iframe already on
   * about:blank; the contentDocument then silently swaps to the real loaded
   * doc WITHOUT firing a load event we can catch (the listener was attached
   * a moment too late). The poll must detect the doc swap on its own.
   */
  it("detects contentDocument swap via polling (even if load event was missed)", async () => {
    const { getEditorIframe, getIframeDocument } = await import("../../utils/iframe-events.js");
    const iframe = document.createElement("iframe");
    const blank = document.implementation.createHTMLDocument("blank");
    vi.mocked(getEditorIframe).mockReturnValue(iframe);
    vi.mocked(getIframeDocument).mockReturnValue(blank);

    const { result } = renderHook(() => useElementTree(true));
    expect(result.current).toHaveLength(0);

    // Silently swap the doc (simulating navigation completion) — NO load event
    const loaded = document.implementation.createHTMLDocument("loaded");
    const el = loaded.createElement("div");
    el.setAttribute("data-source-file", "src/App.tsx");
    el.setAttribute("data-source-line", "1");
    loaded.body.appendChild(el);
    vi.mocked(getIframeDocument).mockReturnValue(loaded);

    // Advance past one poll interval (250ms). Use real timers + act.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
      await rafTick();
    });

    expect(result.current).toHaveLength(1);
    expect(result.current[0].label).toBe("App");

    vi.mocked(getEditorIframe).mockReturnValue(null);
    vi.mocked(getIframeDocument).mockReturnValue(null);
  });

  /**
   * Re-attaches the observer after the iframe's contentDocument is replaced
   * by navigation. Without the `load` listener, the observer on the stale
   * about:blank body would miss all future mutations.
   */
  it("re-observes the new document after iframe navigation (stale-doc guard)", async () => {
    const { getEditorIframe, getIframeDocument } = await import("../../utils/iframe-events.js");
    const iframe = document.createElement("iframe");
    const initialDoc = document.implementation.createHTMLDocument("initial");
    vi.mocked(getEditorIframe).mockReturnValue(iframe);
    vi.mocked(getIframeDocument).mockReturnValue(initialDoc);

    const { result } = renderHook(() => useElementTree(true));
    expect(result.current).toHaveLength(0);

    // Navigation: iframe now has a fresh document (common after iframe.src changes)
    const newDoc = document.implementation.createHTMLDocument("new");
    vi.mocked(getIframeDocument).mockReturnValue(newDoc);

    await act(async () => {
      iframe.dispatchEvent(new Event("load"));
      await rafTick();
    });

    // React mounts in the NEW doc — observer must be on newDoc, not initialDoc
    await act(async () => {
      const el = newDoc.createElement("div");
      el.setAttribute("data-source-file", "src/Nav.tsx");
      el.setAttribute("data-source-line", "1");
      newDoc.body.appendChild(el);
      await rafTick();
      await rafTick();
    });

    expect(result.current).toHaveLength(1);
    expect(result.current[0].label).toBe("Nav");

    // A mutation on the stale doc should NOT populate the tree
    await act(async () => {
      const el = initialDoc.createElement("div");
      el.setAttribute("data-source-file", "src/Stale.tsx");
      el.setAttribute("data-source-line", "1");
      initialDoc.body.appendChild(el);
      await rafTick();
      await rafTick();
    });

    // Still just Nav, not Stale
    expect(result.current.map((n) => n.label)).toEqual(["Nav"]);

    vi.mocked(getEditorIframe).mockReturnValue(null);
    vi.mocked(getIframeDocument).mockReturnValue(null);
  });
});
