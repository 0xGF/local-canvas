/**
 * PropertiesPanel — round-trip, edge-case, and interaction coverage.
 *
 * The sibling PropertiesPanel.test.tsx is a smoke pass: one `it` per
 * property, asserting a single class is emitted. This file stresses the
 * paths that tend to silently corrupt the source — round-tripping values,
 * bracket-arbitrary encoding, breakpoint-prefix stacking, clearing a value
 * vs. writing the default, and the inline-style ↔ class handoff.
 */
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, cleanup, fireEvent, screen } from "@testing-library/react";

// ── Mocks (must be declared before importing the panel) ───────────────────

const mockSendMutation = vi.fn().mockResolvedValue(undefined);
vi.mock("../../hooks/useWebSocket.js", () => ({
  useWebSocket: () => ({
    send: vi.fn(),
    sendMutation: mockSendMutation,
    undo: vi.fn(),
    redo: vi.fn(),
    onMessage: vi.fn(() => () => {}),
  }),
}));

vi.mock("../../utils/iframe-events.js", () => ({
  getIframeDocument: vi.fn().mockReturnValue(null),
  getEditorIframe: vi.fn().mockReturnValue(null),
}));

vi.mock("../../hooks/useSelectionColors.js", () => ({
  useSelectionColors: () => [],
}));

// ── Imports ───────────────────────────────────────────────────────────────
import { PropertiesPanel } from "../PropertiesPanel.js";
import { useEditorStore } from "../../stores/editor-store.js";
import type { SelectedElement } from "../../stores/editor-store.js";

// ── Harness ───────────────────────────────────────────────────────────────

function makeEl(classes: string, tag = "div", inlineStyle = ""): HTMLElement {
  const el = document.createElement(tag);
  el.className = classes;
  if (inlineStyle) el.setAttribute("style", inlineStyle);
  document.body.appendChild(el);
  return el;
}

function selectElement(el: HTMLElement) {
  const sel: SelectedElement = {
    element: el,
    source: { filePath: "/app/src/test.tsx", line: 10, column: 5 },
    rect: new DOMRect(0, 0, 100, 100),
    className: el.className,
    tagName: el.tagName.toLowerCase(),
  };
  useEditorStore.setState({
    selectedElement: sel,
    multiSelection: [],
    propertiesOpen: true,
  });
}

async function mount(classes: string, opts: { tag?: string; inlineStyle?: string; breakpoint?: number } = {}) {
  useEditorStore.setState({ breakpoint: opts.breakpoint ?? 0 });
  const el = makeEl(classes, opts.tag ?? "div", opts.inlineStyle ?? "");
  selectElement(el);
  let utils!: ReturnType<typeof render>;
  // PropertiesPanel uses `React.lazy` for rarely-opened sections (Shadow,
  // Typography, Filters, etc.). Flush the Suspense cycle before queries.
  // Matches the helper in PropertiesPanel.test.tsx.
  await act(async () => {
    utils = render(<PropertiesPanel />);
  });
  await act(async () => { await Promise.resolve(); });
  return { el, ...utils };
}

function allMutations() {
  return mockSendMutation.mock.calls.map(c => c[0]) as Array<
    | { type: "modify-class"; source: unknown; remove?: string[]; add?: string[] }
    | { type: "modify-style"; source: unknown; property: string; value: string }
  >;
}

function classMutations() {
  return allMutations().filter(m => m.type === "modify-class") as Array<{
    type: "modify-class"; remove?: string[]; add?: string[];
  }>;
}

function styleMutations() {
  return allMutations().filter(m => m.type === "modify-style") as Array<{
    type: "modify-style"; property: string; value: string;
  }>;
}

function lastClassMutation() {
  const all = classMutations();
  return all[all.length - 1];
}

function findScrubInput(id: string | RegExp): HTMLInputElement | null {
  const match = (s: string) => (typeof id === "string" ? s === id : id.test(s));
  // (1) data-title
  for (const w of Array.from(document.querySelectorAll<HTMLElement>("[data-title]"))) {
    if (!match(w.getAttribute("data-title") || "")) continue;
    const inp = w.querySelector("input");
    if (inp) return inp as HTMLInputElement;
  }
  // (2) label span text
  for (const inp of Array.from(document.querySelectorAll<HTMLInputElement>("input"))) {
    const parent = inp.parentElement;
    if (!parent) continue;
    for (const lbl of Array.from(parent.querySelectorAll("span"))) {
      if (match((lbl.textContent || "").trim())) return inp;
    }
  }
  // (3) placeholder
  for (const inp of Array.from(document.querySelectorAll<HTMLInputElement>("input"))) {
    if (match(inp.placeholder || "")) return inp;
  }
  return null;
}

function readScrub(id: string | RegExp): string {
  const inp = findScrubInput(id);
  if (!inp) throw new Error(`ScrubField "${id}" not found`);
  return inp.value;
}

function typeInScrub(id: string | RegExp, value: string) {
  const inp = findScrubInput(id);
  if (!inp) throw new Error(`ScrubField "${id}" not found`);
  fireEvent.change(inp, { target: { value } });
  fireEvent.blur(inp);
  vi.runAllTimers();
}

function selectOption(title: string | RegExp, optionText: string | RegExp) {
  const wrappers = Array.from(document.querySelectorAll<HTMLElement>("[data-title]"));
  const match = wrappers.find(w => {
    const t = w.getAttribute("data-title") || "";
    return typeof title === "string" ? t === title : title.test(t);
  });
  if (!match) throw new Error(`SelectField titled "${title}" not found`);
  const trigger = match.querySelector<HTMLButtonElement>("button[aria-haspopup]");
  if (!trigger) throw new Error(`No trigger inside SelectField titled "${title}"`);
  fireEvent.click(trigger);
  const opt = screen.getByRole("option", { name: optionText });
  fireEvent.click(opt);
  vi.runAllTimers();
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockSendMutation.mockClear();
  useEditorStore.setState({
    selectedElement: null,
    multiSelection: [],
    propertiesOpen: false,
    mode: "edit",
    breakpoint: 0,
  });
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

// ═════════════════════════════════════════════════════════════════════════
// 1. ROUND-TRIP — display encodes, write decodes back to the same class
// ═════════════════════════════════════════════════════════════════════════

describe("Round-trip: READ decodes class → display; WRITE encodes display → class", () => {
  // Read and write are tested separately because the mock never reflects
  // mutations back to the element's className, so consecutive writes from
  // the same "displayed" value short-circuit in ScrubField.commit. Reading
  // from a new element is the ground-truth round-trip check — if encode and
  // decode disagree, one of the two assertions below fails.
  const cases: Array<{
    label: string;
    class: string;
    field: string | RegExp;
    display: string;
    typeValue: string;
  }> = [
    // Layout
    { label: "w-4", class: "w-4", field: "W", display: "16px", typeValue: "16" },
    { label: "w-[13px]", class: "w-[13px]", field: "W", display: "13px", typeValue: "13" },
    { label: "h-4", class: "h-4", field: "H", display: "16px", typeValue: "16" },
    { label: "z-10", class: "z-10", field: "Z", display: "10", typeValue: "10" },

    // Spacing
    { label: "px-4", class: "px-4", field: "PX", display: "16px", typeValue: "16" },
    { label: "py-2", class: "py-2", field: "PY", display: "8px", typeValue: "8" },

    // Typography
    { label: "text-lg", class: "text-lg", field: /Font size/, display: "18px", typeValue: "18" },
    { label: "text-[13px]", class: "text-[13px]", field: /Font size/, display: "13px", typeValue: "13" },
  ];

  for (const c of cases) {
    it(`${c.label} decodes to "${c.display}"`, async () => {
      await mount(c.class);
      expect(readScrub(c.field)).toBe(c.display);
    });

    it(`typing "${c.typeValue}" from empty encodes to "${c.label}"`, async () => {
      await mount("");
      typeInScrub(c.field, c.typeValue);
      const m = lastClassMutation();
      expect(m.add).toContain(c.class);
    });
  }
});

// ═════════════════════════════════════════════════════════════════════════
// 2. ARBITRARY-VALUE parsing & encoding
// ═════════════════════════════════════════════════════════════════════════

describe("Arbitrary values", () => {
  it("off-scale spacing writes `[Npx]` bracket", async () => {
    await mount("");
    typeInScrub("PX", "17");
    expect(lastClassMutation().add).toContain("px-[17px]");
  });

  it("negative margin numeric writes `-mx-N` (scale form) for multiple-of-4", async () => {
    await mount("");
    typeInScrub("MX", "-8");
    const add = lastClassMutation().add || [];
    expect(add.some(c => /^(-mx-2|mx-\[-8px\])$/.test(c))).toBe(true);
  });

  it("negative off-scale margin writes `mx-[-Npx]` bracket", async () => {
    await mount("");
    typeInScrub("MX", "-7");
    const add = lastClassMutation().add || [];
    expect(add.some(c => /^(mx-\[-7px\]|-mx-\[7px\])$/.test(c))).toBe(true);
  });

  it("round-trips an off-scale bracket radius through write", async () => {
    // Starting from rounded-[13px], edit via the per-corner toggle entry
    // isn't reliable in jsdom (computed style is 0px), so exercise the
    // write path directly: the linked-mode ScrubField exists even when
    // computed radius is 0.
    await mount("rounded-[13px]");
    // The radius ScrubField has no title — find it by its `rounded-[13px]`
    // value on the rendered input.
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input"));
    const radiusInp = inputs.find(i => i.value === "13px");
    expect(radiusInp).toBeTruthy();
    // Perturb then return — must encode back to the bracket form.
    fireEvent.change(radiusInp!, { target: { value: "16" } });
    fireEvent.blur(radiusInp!);
    vi.runAllTimers();
    fireEvent.change(radiusInp!, { target: { value: "13" } });
    fireEvent.blur(radiusInp!);
    vi.runAllTimers();
    expect(lastClassMutation().add).toContain("rounded-[13px]");
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 3. BREAKPOINT PREFIX STACKING
// ═════════════════════════════════════════════════════════════════════════

describe("Breakpoint-prefix stacking", () => {
  it("at md: breakpoint, writing width emits md:-prefixed class", async () => {
    // breakpoint=768 → 'md' per getBreakpointPrefix
    await mount("", { breakpoint: 768 });
    typeInScrub("W", "16");
    const add = lastClassMutation().add || [];
    expect(add.some(c => c === "md:w-4")).toBe(true);
  });

  it("at md: breakpoint, reading shows md:-prefixed value, not base", async () => {
    await mount("w-4 md:w-8", { breakpoint: 768 });
    // md:w-8 = 32px should win at md breakpoint
    expect(readScrub("W")).toBe("32px");
  });

  it("at base breakpoint, md:-prefixed class is not stripped when editing base", async () => {
    // Bug shape: user edits W at base breakpoint, panel nukes md:w-8 too.
    await mount("w-4 md:w-8");
    typeInScrub("W", "24");
    const m = lastClassMutation();
    // The base class must be swapped, but the md: override must survive.
    expect(m.remove || []).not.toContain("md:w-8");
    expect(m.add).toContain("w-6");
  });

  it("at md: breakpoint, editing removes only the md:-prefixed class", async () => {
    await mount("w-4 md:w-8", { breakpoint: 768 });
    typeInScrub("W", "24");
    const m = lastClassMutation();
    expect(m.remove || []).toContain("md:w-8");
    expect(m.remove || []).not.toContain("w-4");
    expect(m.add).toContain("md:w-6");
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 4. CLEAR / UNSET — blanking the input must remove the class
// ═════════════════════════════════════════════════════════════════════════

describe("Clearing values", () => {
  it("clearing width removes the class entirely (no w-0 write)", async () => {
    await mount("w-4");
    typeInScrub("W", "");
    const m = lastClassMutation();
    expect(m.remove || []).toContain("w-4");
    // A clear must not silently switch to w-0 (a visible zero-sized box).
    expect(m.add || []).not.toContain("w-0");
  });

  it("clearing padding removes px class", async () => {
    await mount("px-4");
    typeInScrub("PX", "");
    expect(lastClassMutation().remove || []).toContain("px-4");
  });

  it("clearing z-index removes z class", async () => {
    await mount("z-10");
    typeInScrub("Z", "");
    const m = lastClassMutation();
    expect(m.remove || []).toContain("z-10");
    expect(m.add || []).not.toContain("z-0");
  });

  it("clearing a prefixed value (md:mx-4) removes the prefixed class", async () => {
    await mount("md:mx-4");
    typeInScrub("MX", "");
    expect(lastClassMutation().remove || []).toContain("md:mx-4");
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 5. INLINE-STYLE ↔ CLASS HANDOFF
// ═════════════════════════════════════════════════════════════════════════

describe("Inline style ↔ class handoff", () => {
  it("editing width when element has inline `width: 20px` routes through modify-style", async () => {
    await mount("", { inlineStyle: "width: 20px" });
    typeInScrub("W", "24");
    const styles = styleMutations();
    const classes = classMutations();
    // The class path would be silently shadowed by the inline rule; panel
    // must detect the inline source and emit a style mutation instead.
    expect(styles.some(m => m.property === "width" && /24/.test(m.value))).toBe(true);
    // And it should NOT emit a modify-class for width while the inline is
    // still there (would be a no-op visually).
    expect(classes.some(m => (m.add || []).some(c => /^w-/.test(c)))).toBe(false);
  });

  it("plain class edit (no inline style) stays on the class path", async () => {
    await mount("w-4");
    typeInScrub("W", "24");
    const styles = styleMutations();
    const classes = classMutations();
    expect(classes.length).toBeGreaterThan(0);
    expect(styles.some(m => m.property === "width")).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 6. SELECTION CHANGES — UI reflects the newly-selected element
// ═════════════════════════════════════════════════════════════════════════

describe("Selection change resets display", () => {
  it("switching from w-4 to w-8 updates the field value", async () => {
    const { rerender } = await mount("w-4");
    expect(readScrub("W")).toBe("16px");

    const el2 = makeEl("w-8");
    selectElement(el2);
    rerender(<PropertiesPanel />);
    expect(readScrub("W")).toBe("32px");
  });

  it("switching from no-class to w-4 populates the field", async () => {
    const { rerender } = await mount("");
    expect(readScrub("W")).toBe("");

    const el2 = makeEl("w-4");
    selectElement(el2);
    rerender(<PropertiesPanel />);
    expect(readScrub("W")).toBe("16px");
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 7. DUPLICATE-CLASS / CONFLICT resolution on write
// ═════════════════════════════════════════════════════════════════════════

describe("Conflict resolution", () => {
  it("writing width removes the previous width class", async () => {
    await mount("w-4");
    typeInScrub("W", "24");
    const m = lastClassMutation();
    expect(m.remove || []).toContain("w-4");
    expect(m.add).toContain("w-6");
  });

  it("writing a new display option removes the old one", async () => {
    await mount("block");
    const btn = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
      .find(b => (b.textContent || "").trim() === "Flex");
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    vi.runAllTimers();
    const m = lastClassMutation();
    expect(m.remove || []).toContain("block");
    expect(m.add).toContain("flex");
  });

  it("position=static from relative clears top/right/bottom/left intent", async () => {
    // Tailwind doesn't auto-clear these, but the panel should at least swap
    // the position class cleanly so the user doesn't end up with both
    // `relative` and `static`.
    await mount("relative");
    selectOption("Position", /^Static$/);
    const m = lastClassMutation();
    expect(m.remove || []).toContain("relative");
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 8. SHADOW LAYER STACKING
// ═════════════════════════════════════════════════════════════════════════

describe("Shadow layer parsing & stacking", () => {
  it("parses a single `shadow-[X_Y_B_S_rgba(...)]` layer", async () => {
    await mount("shadow-[2px_4px_8px_0px_rgba(0,0,0,0.2)]");
    // ShadowLayerRow renders ScrubFields with titles X/Y/B/S offset/Blur/Spread.
    const findByTitle = (t: string) => {
      const wrap = Array.from(document.querySelectorAll<HTMLElement>("[data-title]"))
        .find(w => w.getAttribute("data-title") === t);
      return wrap?.querySelector("input") as HTMLInputElement | null;
    };
    expect(findByTitle("X offset")?.value).toBe("2px");
    expect(findByTitle("Y offset")?.value).toBe("4px");
    expect(findByTitle("Blur")?.value).toBe("8px");
    expect(findByTitle("Spread")?.value).toBe("0px");
  });

  it("editing X on a two-layer shadow preserves the second layer", async () => {
    await mount("shadow-[2px_4px_8px_0px_rgba(0,0,0,0.2),1px_2px_4px_0px_rgba(0,0,0,0.1)]");
    // Grab the FIRST X offset input (layer 0) and change it.
    const firstX = document.querySelector<HTMLInputElement>('[data-title="X offset"] input');
    expect(firstX).toBeTruthy();
    fireEvent.change(firstX!, { target: { value: "10" } });
    fireEvent.blur(firstX!);
    vi.runAllTimers();

    const add = lastClassMutation().add?.[0] || "";
    // Both layers must still be present; layer 1 untouched.
    expect(add).toMatch(/^shadow-\[/);
    expect(add).toContain("10px_4px_8px_0px_rgba(0,0,0,0.2)");
    expect(add).toContain("1px_2px_4px_0px_rgba(0,0,0,0.1)");
  });

  it("editing a drop-shadow layer preserves a coexisting inset layer", async () => {
    await mount("shadow-[2px_4px_8px_0px_rgba(0,0,0,0.2),inset_0px_1px_2px_0px_rgba(255,255,255,0.3)]");
    const firstX = document.querySelector<HTMLInputElement>('[data-title="X offset"] input');
    fireEvent.change(firstX!, { target: { value: "5" } });
    fireEvent.blur(firstX!);
    vi.runAllTimers();

    const add = lastClassMutation().add?.[0] || "";
    expect(add).toContain("5px_4px_8px_0px_rgba(0,0,0,0.2)");
    // Inset layer unchanged (and still first-class citizen — inset flag intact).
    expect(add).toContain("inset_0px_1px_2px_0px_rgba(255,255,255,0.3)");
  });

  it("adding a second shadow layer appends to the existing class", async () => {
    await mount("shadow-[2px_4px_8px_0px_rgba(0,0,0,0.2)]");
    const addBtn = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
      .find(b => /Add shadow layer/i.test(b.getAttribute("title") || b.getAttribute("aria-label") || ""));
    expect(addBtn).toBeTruthy();
    fireEvent.click(addBtn!);
    vi.runAllTimers();

    const add = lastClassMutation().add?.[0] || "";
    // Original layer preserved + new layer appended (default drop shadow
    // is 0px_4px_8px_0px_rgba(0,0,0,0.1)). Count layers by splitting on
    // top-level commas — naive `.split(",")` splits the 3 commas inside
    // each rgba(), so the fingerprint match is more reliable.
    expect(add).toContain("2px_4px_8px_0px_rgba(0,0,0,0.2)");
    expect(add).toContain("0px_4px_8px_0px_rgba(0,0,0,0.1)");
  });

  it("depth counter: rgba(…) commas inside the token don't split layers", async () => {
    // If the layer splitter naively split on commas, this would look like
    // five layers instead of one.
    await mount("shadow-[0px_4px_8px_2px_rgba(0,0,0,0.2)]");
    const firstX = document.querySelector<HTMLInputElement>('[data-title="X offset"] input');
    expect(firstX?.value).toBe("0px");
    const firstY = document.querySelector<HTMLInputElement>('[data-title="Y offset"] input');
    expect(firstY?.value).toBe("4px");
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 9. FILTER STACKING — multiple filter classes coexist
// ═════════════════════════════════════════════════════════════════════════

describe("Filter stacking", () => {
  // FilterRow labels are abbreviated ("Bright", "Satur", "Cntr", …) so
  // they fit on one line next to the slider. Keep the strings exact.
  it("editing brightness preserves an existing blur", async () => {
    await mount("blur-[8px] brightness-150");
    typeInScrub("Bright", "75");
    const m = lastClassMutation();
    expect(m.remove || []).toContain("brightness-150");
    expect(m.remove || []).not.toContain("blur-[8px]");
    expect(m.add || []).toContain("brightness-75");
  });

  it("editing blur preserves an existing hue-rotate", async () => {
    await mount("blur-[8px] hue-rotate-[45deg]");
    typeInScrub("Blur", "4");
    const m = lastClassMutation();
    expect(m.remove || []).toContain("blur-[8px]");
    expect(m.remove || []).not.toContain("hue-rotate-[45deg]");
    expect(m.add || []).toContain("blur-[4px]");
  });

  it("setting saturate to 100 (neutral) removes the class", async () => {
    // pctFilter(100).encode returns "" at neutral → the class gets removed
    // entirely rather than written as `saturate-100`.
    await mount("saturate-200");
    typeInScrub("Satur", "100");
    const m = lastClassMutation();
    expect(m.remove || []).toContain("saturate-200");
    expect(m.add || []).not.toContain("saturate-100");
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 10. COLOR FIELD — hex input & round-trip through the text input
// ═════════════════════════════════════════════════════════════════════════

describe("ColorField hex input", () => {
  // ColorField is only visible when a fill/border/outline/shadow needs it.
  // The simplest trigger is the Fill section: element must have a bg-* for
  // the ColorField to render.
  async function mountWithFill(bg: string) {
    return await mount(bg);
  }

  // Locate the ColorField hex input by its formatted display string
  // ("FF0000 / 100%"). Must filter by non-empty value so we don't match
  // empty ColorFields with the same placeholder elsewhere in the panel.
  function findColorFieldInput(): HTMLInputElement | undefined {
    return Array.from(document.querySelectorAll<HTMLInputElement>("input"))
      .find(i => i.value !== "" && /^\s*[0-9A-F]{6}\s*\/\s*\d+%?/i.test(i.value));
  }

  it("displays the fill color in the ColorField input", async () => {
    await mountWithFill("bg-[#ff0000]");
    const inp = findColorFieldInput();
    expect(inp).toBeTruthy();
    expect(inp!.value.toUpperCase()).toMatch(/FF0000/);
  });

  it("typing a new hex commits through onChange → class mutation", async () => {
    await mountWithFill("bg-[#ff0000]");
    const inp = findColorFieldInput();
    expect(inp).toBeTruthy();
    fireEvent.change(inp!, { target: { value: "00FF00" } });
    fireEvent.blur(inp!);
    vi.runAllTimers();
    const adds = classMutations().flatMap(m => m.add || []);
    // Fill writes `bg-[#<hex>]` — accept any case variant.
    expect(adds.some(c => /^bg-\[#00ff00\]$/i.test(c))).toBe(true);
  });
});
