import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { elementAtPoint } from "../useSelection.js";

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
