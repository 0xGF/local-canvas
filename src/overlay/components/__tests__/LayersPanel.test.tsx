import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";

// Fall back to main document — no iframe in jsdom
vi.mock("../../utils/iframe-events.js", () => ({
  getIframeDocument: vi.fn().mockReturnValue(null),
  getEditorIframe: vi.fn().mockReturnValue(null),
}));

// Deterministic source resolver — returns something click handlers can use
vi.mock("../../../core/source-map/resolver.js", () => ({
  resolveSource: vi.fn((el: HTMLElement) => {
    const file = el.dataset.sourceFile;
    const line = el.dataset.sourceLine;
    return file && line ? { filePath: file, line: parseInt(line, 10) } : null;
  }),
}));

import { LayersPanel } from "../LayersPanel.js";
import { useEditorStore } from "../../stores/editor-store.js";
import { DEFAULT_BREAKPOINT } from "../../../shared/breakpoints.js";

/** Element with source-map attributes. */
function se(
  tag: string,
  file: string,
  line: number,
  children: (HTMLElement | string)[] = [],
): HTMLElement {
  const el = document.createElement(tag);
  el.setAttribute("data-source-file", file);
  el.setAttribute("data-source-line", String(line));
  for (const c of children) {
    el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return el;
}

function resetStore(patch: Partial<ReturnType<typeof useEditorStore.getState>> = {}) {
  useEditorStore.setState({
    mode: "edit",
    selectedElement: null,
    multiSelection: [],
    hoveredElement: null,
    contextMenu: null,
    propertiesOpen: false,
    paletteOpen: false,
    commandBarOpen: false,
    connected: false,
    toolbarVisible: true,
    breakpoint: DEFAULT_BREAKPOINT,
    pendingCount: 0,
    layersOpen: true,
    layersWidth: 260,
    ...patch,
  });
}

describe("LayersPanel", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    resetStore();
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
  });

  it("renders nothing when layersOpen=false", () => {
    resetStore({ layersOpen: false });
    const { container } = render(<LayersPanel />);
    expect(container.innerHTML).toBe("");
  });

  it("renders the header and filter when open", () => {
    const { getByText, getByPlaceholderText } = render(<LayersPanel />);
    expect(getByText("Layers")).toBeTruthy();
    expect(getByPlaceholderText("Filter layers")).toBeTruthy();
  });

  it("shows an empty-state message when no source-mapped elements exist", () => {
    const { getByText } = render(<LayersPanel />);
    expect(getByText(/No source-mapped elements/i)).toBeTruthy();
  });

  it("renders the root using its component name and children with their tag names", () => {
    document.body.appendChild(
      se("div", "src/Hero.tsx", 1, [
        se("h1", "src/Hero.tsx", 5, ["Hello"]),
      ]),
    );
    const { getByText, queryByText } = render(<LayersPanel />);
    expect(getByText("Hero")).toBeTruthy();
    // Children are collapsed by default (classic Figma behaviour)
    expect(queryByText("h1")).toBeNull();

    // Expand the Hero branch via its chevron button
    const heroRow = getByText("Hero").closest("[data-layer-path]")!;
    fireEvent.click(heroRow.querySelector("button")!);
    expect(getByText("h1")).toBeTruthy(); // inside the same component → tag name
  });

  it("clicking a row selects the element in the editor store", () => {
    const hero = se("div", "src/Hero.tsx", 1);
    hero.className = "hero-root";
    document.body.appendChild(hero);

    const { getByText } = render(<LayersPanel />);
    const row = getByText("Hero").closest("[data-layer-path]")!;
    fireEvent.click(row);

    const sel = useEditorStore.getState().selectedElement;
    expect(sel).toBeTruthy();
    expect(sel?.element).toBe(hero);
    expect(sel?.source?.filePath).toBe("src/Hero.tsx");
    expect(sel?.tagName).toBe("div");
    expect(sel?.className).toBe("hero-root");
  });

  it("hovering a row sets hoveredElement in the store (canvas hover mirror)", () => {
    const hero = se("div", "src/Hero.tsx", 1);
    document.body.appendChild(hero);

    const { getByText } = render(<LayersPanel />);
    const row = getByText("Hero").closest("[data-layer-path]")!;
    fireEvent.mouseEnter(row);

    expect(useEditorStore.getState().hoveredElement).toBe(hero);
  });

  it("filter narrows visible rows by label", () => {
    document.body.appendChild(se("div", "src/Hero.tsx", 1));
    document.body.appendChild(se("div", "src/Footer.tsx", 1));

    const { getByPlaceholderText, queryByText } = render(<LayersPanel />);
    expect(queryByText("Hero")).toBeTruthy();
    expect(queryByText("Footer")).toBeTruthy();

    fireEvent.change(getByPlaceholderText("Filter layers"), { target: { value: "foot" } });

    expect(queryByText("Hero")).toBeNull();
    expect(queryByText("Footer")).toBeTruthy();
  });

  it("clear button wipes the filter", () => {
    document.body.appendChild(se("div", "src/Hero.tsx", 1));
    document.body.appendChild(se("div", "src/Footer.tsx", 1));

    const { getByPlaceholderText, queryByText, getByTitle } = render(<LayersPanel />);
    const filter = getByPlaceholderText("Filter layers") as HTMLInputElement;
    fireEvent.change(filter, { target: { value: "foot" } });
    expect(queryByText("Hero")).toBeNull();

    fireEvent.click(getByTitle("Clear"));
    expect(filter.value).toBe("");
    expect(queryByText("Hero")).toBeTruthy();
    expect(queryByText("Footer")).toBeTruthy();
  });

  it("chevron collapses and expands a branch", () => {
    document.body.appendChild(
      se("div", "src/Hero.tsx", 1, [se("h1", "src/Hero.tsx", 5, ["Hello"])]),
    );

    const { getByText, queryByText, container } = render(<LayersPanel />);
    // Child is initially NOT expanded (expanded set starts empty)
    expect(queryByText("h1")).toBeNull();

    // Click the chevron button in the Hero row
    const heroRow = getByText("Hero").closest("[data-layer-path]")!;
    const chevron = heroRow.querySelector("button")!;
    fireEvent.click(chevron);

    expect(queryByText("h1")).toBeTruthy();

    // Collapsing again hides the child
    fireEvent.click(heroRow.querySelector("button")!);
    expect(queryByText("h1")).toBeNull();
    expect(container.querySelector(`[data-layer-path="0"]`)).toBeTruthy();
  });

  it("auto-expands ancestors when the canvas selects a nested element", async () => {
    const h1 = se("h1", "src/Hero.tsx", 5, ["Hello"]);
    document.body.appendChild(se("div", "src/Hero.tsx", 1, [h1]));

    const { queryByText, rerender } = render(<LayersPanel />);
    // Child is initially hidden (parent not expanded)
    expect(queryByText("h1")).toBeNull();

    // Simulate canvas-side selection of the nested element
    useEditorStore.getState().selectElement({
      element: h1,
      source: { filePath: "src/Hero.tsx", line: 5 },
      rect: h1.getBoundingClientRect(),
      className: "",
      tagName: "h1",
    });

    rerender(<LayersPanel />);
    expect(queryByText("h1")).toBeTruthy();
  });

  it("shows no rows for a non-matching filter (still renders the filter input)", () => {
    document.body.appendChild(se("div", "src/Hero.tsx", 1));

    const { getByPlaceholderText, getByText } = render(<LayersPanel />);
    fireEvent.change(getByPlaceholderText("Filter layers"), { target: { value: "zzzz" } });
    expect(getByText("No matches.")).toBeTruthy();
  });

  it("close button toggles the panel off", () => {
    const { getByTitle } = render(<LayersPanel />);
    expect(useEditorStore.getState().layersOpen).toBe(true);
    fireEvent.click(getByTitle("Close"));
    expect(useEditorStore.getState().layersOpen).toBe(false);
  });

  it("ctrl-click on a row opens the context menu (mirrors canvas Ctrl+click)", () => {
    const hero = se("div", "src/Hero.tsx", 1);
    document.body.appendChild(hero);

    const { getByText } = render(<LayersPanel />);
    const row = getByText("Hero").closest("[data-layer-path]")!;
    fireEvent.click(row, { ctrlKey: true });

    const menu = useEditorStore.getState().contextMenu;
    expect(menu).toBeTruthy();
    expect(menu?.element).toBe(hero);
    expect(menu?.source?.filePath).toBe("src/Hero.tsx");
  });

  it("cmd-click on a row opens the context menu (non-Mac only; on Mac cmd-click is ignored)", () => {
    const hero = se("div", "src/Hero.tsx", 1);
    document.body.appendChild(hero);

    const isMac = /Mac/.test(navigator.userAgent);
    const { getByText } = render(<LayersPanel />);
    const row = getByText("Hero").closest("[data-layer-path]")!;
    fireEvent.click(row, { metaKey: true });

    const menu = useEditorStore.getState().contextMenu;
    if (isMac) {
      expect(menu).toBeNull();
    } else {
      expect(menu).toBeTruthy();
      expect(menu?.element).toBe(hero);
    }
  });

  it("right-click on a row opens the context menu", () => {
    const hero = se("div", "src/Hero.tsx", 1);
    document.body.appendChild(hero);

    const { getByText } = render(<LayersPanel />);
    const row = getByText("Hero").closest("[data-layer-path]")!;
    fireEvent.contextMenu(row);

    const menu = useEditorStore.getState().contextMenu;
    expect(menu).toBeTruthy();
    expect(menu?.element).toBe(hero);
  });

  it("regular click on a row does NOT open the context menu", () => {
    const hero = se("div", "src/Hero.tsx", 1);
    document.body.appendChild(hero);

    const { getByText } = render(<LayersPanel />);
    const row = getByText("Hero").closest("[data-layer-path]")!;
    fireEvent.click(row);

    expect(useEditorStore.getState().contextMenu).toBeNull();
    expect(useEditorStore.getState().selectedElement?.element).toBe(hero);
  });
});
