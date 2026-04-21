/**
 * PropertiesPanel — end-to-end property coverage.
 *
 * Mounts the panel with a synthetic selected element, drives each control,
 * and asserts the mutation sent to the WebSocket has the expected shape.
 * One `it` per property.
 */
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";

// ── Module mocks (must run before component import) ──────────────────────

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

// ── Imports that depend on the mocks above ───────────────────────────────
import { PropertiesPanel } from "../PropertiesPanel.js";
import { useEditorStore } from "../../stores/editor-store.js";
import type { SelectedElement } from "../../stores/editor-store.js";

// ── Helpers ──────────────────────────────────────────────────────────────

function makeEl(classes: string, tag = "div"): HTMLElement {
  const el = document.createElement(tag);
  el.className = classes;
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

function mount(classes: string, tag = "div") {
  const el = makeEl(classes, tag);
  selectElement(el);
  const utils = render(<PropertiesPanel />);
  return { el, ...utils };
}

function classMutations() {
  return mockSendMutation.mock.calls
    .map(c => c[0])
    .filter((m: unknown) => !!m && (m as { type: string }).type === "modify-class") as {
      type: "modify-class";
      remove?: string[];
      add?: string[];
    }[];
}

function lastMutation() {
  const all = classMutations();
  return all[all.length - 1];
}

/**
 * Find a ScrubField's <input> by one of:
 *   1. `data-title` on the wrapper div (preferred — ScrubField exposes it),
 *   2. the text content of the label span (e.g. "W", "H"),
 *   3. the input's placeholder (last resort).
 */
function findScrubInput(id: string | RegExp): HTMLInputElement | null {
  const match = (str: string) =>
    typeof id === "string" ? str === id : id.test(str);

  // (1) Wrapper with matching data-title.
  const wrappers = Array.from(document.querySelectorAll<HTMLElement>("[data-title]"));
  for (const w of wrappers) {
    if (!match(w.getAttribute("data-title") || "")) continue;
    const inp = w.querySelector("input");
    if (inp) return inp as HTMLInputElement;
  }
  // (2) Label span text (for fields without a title).
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input"));
  for (const inp of inputs) {
    const parent = inp.parentElement;
    if (!parent) continue;
    const labels = parent.querySelectorAll("span");
    for (const lbl of Array.from(labels)) {
      if (match((lbl.textContent || "").trim())) return inp;
    }
  }
  // (3) Placeholder.
  for (const inp of inputs) {
    if (match(inp.placeholder || "")) return inp;
  }
  return null;
}

function typeInScrub(id: string | RegExp, value: string) {
  const input = findScrubInput(id);
  if (!input) throw new Error(`ScrubField "${id}" not found`);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
  // `h.set` debounces writes (300ms). Flush so the mutation lands before
  // the test asserts.
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

/**
 * The shared `<Button>` wrapper intercepts `title` and renders a Radix
 * tooltip — the native title attribute is NOT re-applied to the <button>
 * element. `title` is mirrored into `aria-label` when none is set, so
 * tests should accept either.
 */
function clickIconButton(id: string | RegExp) {
  const match = (s: string) => typeof id === "string" ? s === id : id.test(s);
  const btn = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(b => {
    for (const attr of ["title", "aria-label"]) {
      const v = b.getAttribute(attr);
      if (v && match(v)) return true;
    }
    return false;
  });
  if (!btn) throw new Error(`Button "${id}" not found`);
  fireEvent.click(btn);
  // Several click handlers (Fill add/remove, Border/Outline add/remove)
  // route through `h.debouncedMutation` so they don't thrash the WS while
  // the user drags. Flush so the resulting mutation is visible to the test.
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
    breakpoint: 0, // unconstrained → no responsive prefix on writes
  });
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

// ════════════════════════════════════════════════════════════════════════
// LAYOUT
// ════════════════════════════════════════════════════════════════════════

describe("Layout section", () => {
  it("reads width from `w-4` as '16px' (lengthDisplay decodes scale → px)", () => {
    mount("w-4");
    const inp = findScrubInput("W");
    expect(inp).toBeTruthy();
    expect(inp!.value).toBe("16px");
  });

  it("writes width via lengthToTailwind — `w-6` for 24px", () => {
    mount("w-4");
    typeInScrub("W", "24");
    expect(lastMutation().add).toContain("w-6");
    expect(lastMutation().remove).toContain("w-4");
  });

  it("off-scale width falls back to bracket `w-[13px]`", () => {
    mount("");
    typeInScrub("W", "13");
    expect(lastMutation().add).toEqual(["w-[13px]"]);
  });

  it("height, min-w, max-w, min-h, max-h each map correctly", () => {
    mount("");
    typeInScrub("H", "16");
    expect(lastMutation().add).toContain("h-4");
    typeInScrub("MIN W", "8");
    expect(lastMutation().add).toContain("min-w-2");
    typeInScrub("MAX W", "16");
    expect(lastMutation().add).toContain("max-w-4");
    typeInScrub("MIN H", "16");
    expect(lastMutation().add).toContain("min-h-4");
    typeInScrub("MAX H", "16");
    expect(lastMutation().add).toContain("max-h-4");
  });

  it("flip-x toggles -scale-x-100", () => {
    mount("");
    clickIconButton("Flip horizontal");
    expect(lastMutation().add).toContain("-scale-x-100");
  });

  it("flip-y removes existing -scale-y-100 (incl. prefixed)", () => {
    mount("md:-scale-y-100");
    clickIconButton("Flip vertical");
    expect(lastMutation().remove).toContain("md:-scale-y-100");
  });

  it("display=flex swaps block→flex", () => {
    mount("block");
    const btn = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
      .find(b => (b.textContent || "").trim() === "Flex");
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    const m = lastMutation();
    expect(m.remove).toContain("block");
    expect(m.add).toContain("flex");
  });

  it("display=hidden swaps block→hidden", () => {
    mount("block");
    const btn = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
      .find(b => (b.textContent || "").trim() === "Hide");
    fireEvent.click(btn!);
    expect(lastMutation().add).toContain("hidden");
  });

  it("position=absolute writes `absolute`", () => {
    mount("");
    selectOption("Position", /^Absolute$/);
    expect(lastMutation().add).toEqual(["absolute"]);
  });

  it("z-index writes `z-10`", () => {
    mount("");
    typeInScrub("Z", "10");
    expect(lastMutation().add).toEqual(["z-10"]);
  });

  it("top/right/bottom/left write length classes when positioned", () => {
    mount("relative");
    typeInScrub("Top", "16");
    expect(lastMutation().add).toContain("top-4");
    typeInScrub("Right", "8");
    expect(lastMutation().add).toContain("right-2");
    typeInScrub("Bottom", "16");
    expect(lastMutation().add).toContain("bottom-4");
    typeInScrub("Left", "8");
    expect(lastMutation().add).toContain("left-2");
  });

  it("overflow writes `overflow-hidden`", () => {
    mount("");
    selectOption("Overflow", /hidden/i);
    expect(lastMutation().add).toContain("overflow-hidden");
  });

  it("aspect-ratio writes `aspect-square`", () => {
    mount("");
    typeInScrub("Aspect ratio", "square");
    expect(lastMutation().add).toContain("aspect-square");
  });

  it("object-fit writes `object-cover`", () => {
    mount("", "img");
    selectOption("Object fit", /cover/i);
    expect(lastMutation().add).toContain("object-cover");
  });
});

// ════════════════════════════════════════════════════════════════════════
// SPACING
// ════════════════════════════════════════════════════════════════════════

describe("Spacing section", () => {
  it("linked padding-X writes `px-4` for 16px", () => {
    mount("");
    typeInScrub("PX", "16");
    expect(lastMutation().add).toContain("px-4");
  });

  it("linked padding-Y writes `py-2` for 8px", () => {
    mount("");
    typeInScrub("PY", "8");
    expect(lastMutation().add).toContain("py-2");
  });

  it("negative margin writes an arbitrary-value class for -8px", () => {
    mount("");
    typeInScrub("MX", "-8");
    // Current encoding: lengthToTailwind emits `[-8px]` for off-scale
    // negatives; writeMargin passes it through → `mx-[-8px]`. Either form
    // is valid Tailwind; assert that the class applied is a negative mx.
    const add = lastMutation().add || [];
    const ok = add.some(c => /^(-mx-2|mx-\[-8px\])$/.test(c));
    expect(ok).toBe(true);
  });

  it("clearing margin removes the class (prefix-aware)", () => {
    mount("md:mx-4");
    typeInScrub("MX", "");
    expect(lastMutation().remove).toContain("md:mx-4");
  });
});

// ════════════════════════════════════════════════════════════════════════
// TYPOGRAPHY
// ════════════════════════════════════════════════════════════════════════

describe("Typography section", () => {
  it("reads `text-lg` as 18px font-size", () => {
    mount("text-lg");
    const inp = findScrubInput(/Font size/);
    expect(inp).toBeTruthy();
    expect(inp!.value).toBe("18px");
  });

  it("writes `text-2xl` for 24px", () => {
    mount("text-lg");
    typeInScrub(/Font size/, "24");
    expect(lastMutation().add).toContain("text-2xl");
    expect(lastMutation().remove).toContain("text-lg");
  });

  it("off-scale font-size writes bracket `text-[13px]`", () => {
    mount("");
    typeInScrub(/Font size/, "13");
    expect(lastMutation().add).toContain("text-[13px]");
  });

  it("font-weight writes `font-bold`", () => {
    mount("");
    selectOption("Font weight", /bold 700/i);
    expect(lastMutation().add).toContain("font-bold");
  });

  it("italic toggle removes when present (prefix-aware)", () => {
    mount("md:italic");
    clickIconButton("Italic");
    expect(lastMutation().remove).toContain("md:italic");
  });

  it("underline toggle adds `underline`", () => {
    mount("");
    clickIconButton("Underline");
    expect(lastMutation().add).toContain("underline");
  });

  it("line-through toggle adds `line-through`", () => {
    mount("");
    clickIconButton("Strikethrough");
    expect(lastMutation().add).toContain("line-through");
  });

  it("text-align writes `text-center`", () => {
    mount("");
    // ToggleGroup buttons' aria-label defaults to label ?? value — the
    // text-align items have no label, so aria-label = "center".
    clickIconButton("center");
    expect(lastMutation().add).toContain("text-center");
  });

  it("text-transform writes `uppercase`", () => {
    mount("");
    selectOption("Text transform", /uppercase/i);
    expect(lastMutation().add).toContain("uppercase");
  });

  it("leading writes `leading-[20px]`", () => {
    mount("");
    typeInScrub(/Line height/, "20");
    expect(lastMutation().add).toContain("leading-[20px]");
  });

  it("tracking writes `tracking-[0.05em]`", () => {
    mount("");
    typeInScrub(/Letter spacing/, "0.05");
    expect(lastMutation().add).toContain("tracking-[0.05em]");
  });

  it("strips md: prefix when removing font-size", () => {
    mount("md:text-lg");
    typeInScrub(/Font size/, "");
    expect(lastMutation().remove).toContain("md:text-lg");
  });
});

// ════════════════════════════════════════════════════════════════════════
// RADIUS
// ════════════════════════════════════════════════════════════════════════

describe("Radius section", () => {
  /** Radius defaults to linked mode — click the corner toggle first so the
   *  split-mode ScrubFields (`Top-left`, etc.) render. */
  function enterSplitMode() {
    clickIconButton(/Per-corner radius|Switch to per-corner/i);
  }

  it("per-corner top-left writes `rounded-tl-lg` for 8px", () => {
    mount("");
    enterSplitMode();
    typeInScrub("Top-left", "8");
    expect(lastMutation().add).toContain("rounded-tl-lg");
  });

  it("per-corner top-right writes `rounded-tr-md` for 6px", () => {
    mount("");
    enterSplitMode();
    typeInScrub("Top-right", "6");
    expect(lastMutation().add).toContain("rounded-tr-md");
  });

  it("off-scale per-corner writes `rounded-br-[5px]`", () => {
    mount("");
    enterSplitMode();
    typeInScrub("Bottom-right", "5");
    expect(lastMutation().add).toContain("rounded-br-[5px]");
  });

  it("detects `md:rounded-lg` via hasValue so the section auto-opens", () => {
    // Spot-check the prefix-aware detection path. The actual sweep happens
    // inside `writeLinked` (driven by a custom Slider); that code path is
    // covered by the existing unit tests for the radius helpers.
    mount("md:rounded-lg");
    // If hasValue missed the prefixed class, the body wouldn't render and
    // the corner-mode toggle button wouldn't be present in the DOM.
    const toggle = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
      .find(b => /per-corner|linked radius/i.test(b.getAttribute("aria-label") || ""));
    expect(toggle).toBeTruthy();
  });
});

// ════════════════════════════════════════════════════════════════════════
// TRANSFORM
// ════════════════════════════════════════════════════════════════════════

describe("Transform section", () => {
  it("rotate writes `rotate-[45deg]`", () => {
    mount("");
    typeInScrub("Rotate (deg)", "45");
    expect(lastMutation().add).toEqual(["rotate-[45deg]"]);
  });

  it("scale 150% writes `scale-[1.5]`", () => {
    mount("");
    typeInScrub("Uniform scale", "150");
    expect(lastMutation().add).toEqual(["scale-[1.5]"]);
  });

  it("rotate 0 removes existing rotate (prefix-aware)", () => {
    mount("md:rotate-[45deg]");
    typeInScrub("Rotate (deg)", "0");
    expect(lastMutation().remove).toContain("md:rotate-[45deg]");
  });
});

// ════════════════════════════════════════════════════════════════════════
// BLENDING
// ════════════════════════════════════════════════════════════════════════

describe("Blending section", () => {
  it("opacity 50 writes `opacity-50`", () => {
    mount("");
    typeInScrub("Opacity", "50");
    expect(lastMutation().add).toContain("opacity-50");
  });

  it("mix-blend writes `mix-blend-multiply`", () => {
    mount("");
    selectOption(/Mix blend mode/, /multiply/i);
    expect(lastMutation().add).toContain("mix-blend-multiply");
  });

  it("strips md: prefix on mix-blend change", () => {
    mount("md:mix-blend-multiply");
    selectOption(/Mix blend mode/, /screen/i);
    expect(lastMutation().remove).toContain("md:mix-blend-multiply");
    expect(lastMutation().add).toContain("mix-blend-screen");
  });
});

// ════════════════════════════════════════════════════════════════════════
// FILL
// ════════════════════════════════════════════════════════════════════════

describe("Fill section", () => {
  it("Remove fill sweeps all bg-* (including prefixed)", () => {
    mount("bg-red-500 md:bg-blue-300");
    clickIconButton("Remove fill");
    const m = lastMutation();
    expect(m.remove).toEqual(
      expect.arrayContaining(["bg-red-500", "md:bg-blue-300"]),
    );
  });

  it("Add fill writes a solid default bg (named or hex bracket)", () => {
    mount("");
    clickIconButton("Add fill");
    // Fill picks either `bg-white` (named mapping) or `bg-[#FFFFFF]` for the
    // default. Accept either since we don't want to lock the impl to one.
    const add = lastMutation()?.add?.[0] ?? "";
    expect(add).toMatch(/^bg-(\[#|white)/i);
  });
});

// ════════════════════════════════════════════════════════════════════════
// OUTLINE
// ════════════════════════════════════════════════════════════════════════

describe("Outline section", () => {
  it("Add outline writes default `outline`", () => {
    mount("");
    clickIconButton("Add outline");
    expect(lastMutation().add).toContain("outline");
  });

  it("weight 4 writes `outline-4`", () => {
    mount("outline");
    typeInScrub("Outline weight", "4");
    expect(lastMutation().add).toContain("outline-4");
  });

  it("off-scale weight writes `outline-[3px]`", () => {
    mount("outline");
    typeInScrub("Outline weight", "3");
    expect(lastMutation().add).toContain("outline-[3px]");
  });

  it("Remove outline sweeps tokens (prefix-aware)", () => {
    mount("md:outline-2 outline-dashed outline-offset-2 outline-[#ff0000]");
    clickIconButton("Remove outline");
    const m = lastMutation();
    expect(m.remove).toEqual(
      expect.arrayContaining(["md:outline-2", "outline-dashed", "outline-offset-2", "outline-[#ff0000]"]),
    );
  });

  it("style selector writes `outline-dashed`", () => {
    mount("outline");
    selectOption("Outline style", /dashed/i);
    expect(lastMutation().add).toContain("outline-dashed");
  });

  it("Hide outline writes `outline-none`", () => {
    mount("outline");
    clickIconButton("Hide outline");
    expect(lastMutation().add).toContain("outline-none");
  });
});

// ════════════════════════════════════════════════════════════════════════
// BORDER
// ════════════════════════════════════════════════════════════════════════

describe("Border section", () => {
  it("Add border writes default `border`", () => {
    mount("");
    clickIconButton("Add border");
    expect(lastMutation().add).toContain("border");
  });

  it("weight 2 writes `border-2`; off-scale writes `border-[3px]`", () => {
    mount("border");
    typeInScrub("Border weight", "2");
    expect(lastMutation().add).toContain("border-2");
    typeInScrub("Border weight", "3");
    expect(lastMutation().add).toContain("border-[3px]");
  });

  it("sides=Top writes `border-t`", () => {
    mount("border");
    selectOption("Border sides", /^Top$/);
    expect(lastMutation().add).toContain("border-t");
  });

  it("Remove border sweeps tokens (prefix-aware)", () => {
    mount("md:border-2 border-dashed border-[#000000]");
    clickIconButton("Remove border");
    const m = lastMutation();
    expect(m.remove).toEqual(
      expect.arrayContaining(["md:border-2", "border-dashed", "border-[#000000]"]),
    );
  });

  it("Hide border writes `border-none`", () => {
    mount("border");
    clickIconButton("Hide border");
    expect(lastMutation().add).toContain("border-none");
  });
});

// ════════════════════════════════════════════════════════════════════════
// SHADOW + INNER SHADOW
// ════════════════════════════════════════════════════════════════════════

describe("Shadow section", () => {
  it("preset writes `shadow-md`", () => {
    mount("");
    selectOption("Shadow preset", /md/i);
    expect(lastMutation().add).toContain("shadow-md");
  });

  it("Add shadow creates a new bracket layer", () => {
    mount("");
    clickIconButton(/Add shadow layer/i);
    expect(lastMutation().add?.[0]).toMatch(/^shadow-\[/);
  });

  it("existing `xl:shadow-[...]` renders a removable layer", () => {
    mount("xl:shadow-[0px_4px_8px_0px_rgba(0,0,0,0.1)]");
    const remove = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(b =>
      /Remove this shadow layer/i.test(b.getAttribute("aria-label") || b.getAttribute("title") || ""),
    );
    expect(remove).toBeTruthy();
  });

  it("Removing a layer with xl: prefix strips the prefixed class", () => {
    mount("xl:shadow-[0px_4px_8px_0px_rgba(0,0,0,0.1)]");
    clickIconButton(/Remove this shadow layer/i);
    expect(lastMutation().remove).toContain("xl:shadow-[0px_4px_8px_0px_rgba(0,0,0,0.1)]");
  });
});

describe("Inner shadow section", () => {
  it("Add inner shadow writes an inset bracket class", () => {
    mount("");
    clickIconButton(/Add inner shadow layer/i);
    expect(lastMutation().add?.[0]).toMatch(/^shadow-\[inset_/);
  });
});

// ════════════════════════════════════════════════════════════════════════
// FILTERS + BACKDROP FILTERS
// ════════════════════════════════════════════════════════════════════════

describe("Filters section", () => {
  it("blur 8 writes `blur-[8px]`", () => {
    mount("");
    typeInScrub("Blur", "8");
    const m = lastMutation();
    expect(m.add?.some(c => c === "blur-[8px]")).toBe(true);
  });

  it("brightness 150 writes `brightness-150`", () => {
    mount("");
    typeInScrub("Bright", "150");
    expect(lastMutation().add?.some(c => c === "brightness-150")).toBe(true);
  });

  it("contrast 75 writes `contrast-75`", () => {
    mount("");
    typeInScrub("Cntr", "75");
    expect(lastMutation().add?.some(c => c === "contrast-75")).toBe(true);
  });

  it("saturate 200 writes `saturate-200`", () => {
    mount("");
    typeInScrub("Satur", "200");
    expect(lastMutation().add?.some(c => c === "saturate-200")).toBe(true);
  });

  it("hue-rotate 45 writes `hue-rotate-[45deg]`", () => {
    mount("");
    typeInScrub("Hue", "45");
    expect(lastMutation().add?.some(c => c === "hue-rotate-[45deg]")).toBe(true);
  });

  it("grayscale 50 writes `grayscale-50`", () => {
    mount("");
    typeInScrub("Gray", "50");
    expect(lastMutation().add?.some(c => c === "grayscale-50")).toBe(true);
  });

  it("invert 100 writes `invert-100`", () => {
    mount("");
    typeInScrub("Invert", "100");
    expect(lastMutation().add?.some(c => c === "invert-100")).toBe(true);
  });

  it("sepia 60 writes `sepia-60`", () => {
    mount("");
    typeInScrub("Sepia", "60");
    expect(lastMutation().add?.some(c => c === "sepia-60")).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════
// TRANSITIONS
// ════════════════════════════════════════════════════════════════════════

describe("Transitions section", () => {
  it("transition=all writes `transition-all`", () => {
    mount("");
    selectOption("Transition property", /^All$/);
    expect(lastMutation().add).toContain("transition-all");
  });

  it("timing function writes `ease-in-out`", () => {
    mount("");
    selectOption("Timing function", /in-out/i);
    expect(lastMutation().add).toContain("ease-in-out");
  });

  it("duration 200 writes `duration-200` (named scale)", () => {
    mount("");
    typeInScrub("Duration (ms)", "200");
    expect(lastMutation().add).toContain("duration-200");
  });

  it("duration 250 writes `duration-[250ms]` (off-scale bracket)", () => {
    mount("");
    typeInScrub("Duration (ms)", "250");
    expect(lastMutation().add).toContain("duration-[250ms]");
  });

  it("delay 100 writes `delay-100`", () => {
    mount("");
    typeInScrub("Delay (ms)", "100");
    expect(lastMutation().add).toContain("delay-100");
  });

  it("animation writes `animate-spin`", () => {
    mount("");
    selectOption("Animation", /spin/i);
    expect(lastMutation().add).toContain("animate-spin");
  });
});

// ════════════════════════════════════════════════════════════════════════
// INTERACTIVITY
// ════════════════════════════════════════════════════════════════════════

describe("Interactivity section", () => {
  it("cursor writes `cursor-pointer`", () => {
    mount("");
    selectOption("Cursor", /^Pointer$/);
    expect(lastMutation().add).toContain("cursor-pointer");
  });

  it("pointer-events writes `pointer-events-none`", () => {
    mount("");
    selectOption("Pointer events", /^None$/);
    expect(lastMutation().add).toContain("pointer-events-none");
  });

  it("user-select writes `select-none`", () => {
    mount("");
    selectOption("User select", /^None$/);
    expect(lastMutation().add).toContain("select-none");
  });

  it("strips md: prefix on cursor change", () => {
    mount("md:cursor-pointer");
    selectOption("Cursor", /^Wait$/);
    const m = lastMutation();
    expect(m.remove).toContain("md:cursor-pointer");
    expect(m.add).toContain("cursor-wait");
  });
});
