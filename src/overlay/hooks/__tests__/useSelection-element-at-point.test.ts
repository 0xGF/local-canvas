import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { elementAtPoint, isClickInsideOverlay } from "../useSelection.js";

/**
 * Regression tests for the overlay-chrome exclusion in elementAtPoint.
 *
 * The overlay's shadow host (#local-canvas-host) stretches across the
 * viewport to receive canvas clicks, so `document.elementFromPoint` will
 * almost always return it when the user clicks anywhere visible. Before
 * the fix, this meant annotate-clicks on the page content actually
 * targeted the shadow host (the "wrong" target), and explicit clicks on
 * overlay chrome (toolbar, panels) wrongly dropped annotation pins on
 * whatever element happened to be under them.
 *
 * The fix: when `document.elementFromPoint` returns the shadow host (or
 * anything inside the overlay's shadow tree), treat it as "no main-doc
 * hit" and fall through to iframe detection. Callers can then add their
 * own `isClickInsideOverlay` check to refuse annotation on interactive
 * overlay UI.
 */

describe("elementAtPoint — overlay host exclusion", () => {
  let shadowHost: HTMLDivElement;
  let regularDiv: HTMLDivElement;

  beforeEach(() => {
    shadowHost = document.createElement("div");
    shadowHost.id = "local-canvas-host";
    shadowHost.style.position = "fixed";
    shadowHost.style.inset = "0";
    shadowHost.attachShadow({ mode: "open" });
    document.body.appendChild(shadowHost);

    regularDiv = document.createElement("div");
    regularDiv.id = "page-content";
    document.body.appendChild(regularDiv);
  });

  afterEach(() => {
    shadowHost.remove();
    regularDiv.remove();
  });

  it("returns null target when elementFromPoint returns the shadow host", () => {
    // Simulate document.elementFromPoint returning the overlay host —
    // exactly what happens every time the user clicks anywhere on the
    // page while the overlay is mounted.
    document.elementsFromPoint = vi.fn(() => [shadowHost]);

    const result = elementAtPoint(100, 100);
    // No iframe is mounted in this test — so main-doc returns null and
    // iframe path returns null too. Result is `target: null`, which is
    // exactly what we want (callers bail instead of targeting the host).
    expect(result.target).toBeNull();
    expect(result.fromIframe).toBe(false);
  });

  it("returns null target when elementFromPoint returns something inside the shadow tree", () => {
    // A portaled dropdown or toolbar button, reached from elementFromPoint
    // via composedPath, would live inside the shadow root.
    const shadowChild = document.createElement("button");
    shadowHost.shadowRoot!.appendChild(shadowChild);
    document.elementsFromPoint = vi.fn(() => [shadowChild]);

    const result = elementAtPoint(100, 100);
    expect(result.target).toBeNull();
  });

  it("returns the hit element when it's regular page content", () => {
    // This is the normal selection path — clicking on an app element.
    document.elementsFromPoint = vi.fn(() => [regularDiv]);

    const result = elementAtPoint(100, 100);
    expect(result.target).toBe(regularDiv);
    expect(result.fromIframe).toBe(false);
  });

  it("returns null if elementFromPoint itself returns null", () => {
    document.elementsFromPoint = vi.fn(() => []);

    const result = elementAtPoint(100, 100);
    expect(result.target).toBeNull();
  });
});

/**
 * Regression test for the annotate-click-in-iframe bug.
 *
 * `isClickInsideOverlay` feeds `e.clientX/Y` into `shadow.elementFromPoint`.
 * Events attached to the iframe document arrive with iframe-LOCAL coords
 * (relative to the iframe viewport), not parent-document coords. At small
 * iframe-local coords those land somewhere random in the parent viewport
 * — frequently inside the LayersPanel at top:8 left:8 with pointerEvents:
 * auto — which made the function falsely report iframe clicks as overlay
 * chrome. That blocked the annotate branch in handleClick: clicks on
 * iframe content stopped opening the Ask AI prompt.
 *
 * The fix short-circuits to false when the event's target ownerDocument is
 * not the parent document, since overlay chrome only ever lives in the
 * main doc's shadow root.
 */
describe("isClickInsideOverlay — iframe origin short-circuit", () => {
  let shadowHost: HTMLDivElement;
  let interactivePanel: HTMLDivElement;

  beforeEach(() => {
    shadowHost = document.createElement("div");
    shadowHost.id = "local-canvas-host";
    const shadow = shadowHost.attachShadow({ mode: "open" });
    document.body.appendChild(shadowHost);

    // Simulate the LayersPanel covering the top-left corner of the viewport.
    interactivePanel = document.createElement("div");
    interactivePanel.style.pointerEvents = "auto";
    shadow.appendChild(interactivePanel);

    shadow.elementFromPoint = vi.fn(() => interactivePanel);
  });

  afterEach(() => {
    shadowHost.remove();
  });

  it("returns false for events originating inside the iframe document", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const iframeDoc = iframe.contentDocument!;
    const iframeTarget = iframeDoc.createElement("div");
    iframeDoc.body.appendChild(iframeTarget);

    // Without the fix, iframe-local coords (40, 40) treated as viewport
    // coords would hit the interactive overlay panel and return true.
    const e = new MouseEvent("click", { clientX: 40, clientY: 40 });
    Object.defineProperty(e, "target", { value: iframeTarget, configurable: true });

    expect(isClickInsideOverlay(e)).toBe(false);

    iframe.remove();
  });

  it("still returns true for real main-doc clicks on overlay chrome", () => {
    const mainTarget = document.createElement("div");
    document.body.appendChild(mainTarget);

    const e = new MouseEvent("click", { clientX: 40, clientY: 40 });
    Object.defineProperty(e, "target", { value: mainTarget, configurable: true });

    expect(isClickInsideOverlay(e)).toBe(true);

    mainTarget.remove();
  });
});
