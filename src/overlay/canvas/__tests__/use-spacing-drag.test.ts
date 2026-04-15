import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSpacingDrag } from "../use-spacing-drag.js";
import { useEditorStore } from "../../stores/editor-store.js";
import { useViewportStore } from "../../hooks/useViewport.js";
import type { BadgeHit, TagBadgeHit } from "../constants.js";
import { DEFAULT_BREAKPOINT } from "../../../shared/breakpoints.js";

// Mock useWebSocket
vi.mock("../../hooks/useWebSocket.js", () => ({
  useWebSocket: () => ({
    sendMutation: vi.fn().mockResolvedValue({}),
  }),
}));

// Mock resolveSource
vi.mock("../../../core/source-map/resolver.js", () => ({
  resolveSource: vi.fn().mockReturnValue(null),
}));

function createMockBadgeHit(overrides: Partial<BadgeHit> = {}): BadgeHit {
  return {
    x: 100, y: 100, w: 40, h: 14,
    type: "padding", side: "top", value: 16, prefix: "pt",
    ...overrides,
  };
}

describe("useSpacingDrag", () => {
  let badgeHitsRef: { current: BadgeHit[] };
  let tagBadgeHitRef: { current: TagBadgeHit | null };

  beforeEach(() => {
    badgeHitsRef = { current: [] };
    tagBadgeHitRef = { current: null };
    useEditorStore.setState({
      mode: "edit",
      selectedElement: null,
      hoveredElement: null,
      propertiesOpen: false,
      paletteOpen: false,
      commandBarOpen: false,
      connected: false,
      toolbarVisible: true,
      breakpoint: DEFAULT_BREAKPOINT,
      pendingCount: 0,
    });
    useViewportStore.setState({ zoom: 1, panX: 0, panY: 0 });
  });

  afterEach(() => {
    document.body.style.cursor = "";
  });

  it("returns dragTooltip as null initially", () => {
    const { result } = renderHook(() => useSpacingDrag(badgeHitsRef, tagBadgeHitRef));
    expect(result.current.dragTooltip).toBeNull();
  });

  it("returns commitSpacing function", () => {
    const { result } = renderHook(() => useSpacingDrag(badgeHitsRef, tagBadgeHitRef));
    expect(typeof result.current.commitSpacing).toBe("function");
  });

  it("sets ns-resize cursor on badge hover", () => {
    const badge = createMockBadgeHit({ x: 100, y: 100, w: 40, h: 14 });
    badgeHitsRef.current = [badge];

    renderHook(() => useSpacingDrag(badgeHitsRef, tagBadgeHitRef));

    // Simulate mousemove over badge
    const moveEvent = new MouseEvent("mousemove", {
      clientX: 110, clientY: 107, bubbles: true,
    });
    document.dispatchEvent(moveEvent);

    expect(document.body.style.cursor).toBe("ns-resize");
  });

  it("resets cursor when not over badge", () => {
    badgeHitsRef.current = [];
    document.body.style.cursor = "ns-resize";

    renderHook(() => useSpacingDrag(badgeHitsRef, tagBadgeHitRef));

    const moveEvent = new MouseEvent("mousemove", {
      clientX: 500, clientY: 500, bubbles: true,
    });
    document.dispatchEvent(moveEvent);

    expect(document.body.style.cursor).toBe("");
  });

  it("initiates spacing drag on mousedown over badge", () => {
    const badge = createMockBadgeHit({ x: 100, y: 100, w: 40, h: 14 });
    badgeHitsRef.current = [badge];

    renderHook(() => useSpacingDrag(badgeHitsRef, tagBadgeHitRef));

    const downEvent = new MouseEvent("mousedown", {
      clientX: 110, clientY: 107, bubbles: true,
    });
    document.dispatchEvent(downEvent);

    expect(document.body.style.cursor).toBe("ns-resize");
  });

  it("cleans up cursor on mouseup after drag", () => {
    const badge = createMockBadgeHit();
    badgeHitsRef.current = [badge];

    renderHook(() => useSpacingDrag(badgeHitsRef, tagBadgeHitRef));

    // Start drag
    const downEvent = new MouseEvent("mousedown", {
      clientX: 110, clientY: 107, bubbles: true,
    });
    document.dispatchEvent(downEvent);

    // End drag (no movement = no commit)
    const upEvent = new MouseEvent("mouseup", {
      clientX: 110, clientY: 107, bubbles: true,
    });
    document.dispatchEvent(upEvent);

    expect(document.body.style.cursor).toBe("");
  });

  it("accounts for zoom scale in drag delta", () => {
    // At 2x zoom, a 10px screen drag = 5px CSS change
    useViewportStore.setState({ zoom: 2, panX: 0, panY: 0 });
    const mockEl = document.createElement("div");
    useEditorStore.setState({
      selectedElement: {
        element: mockEl,
        source: null,
        rect: mockEl.getBoundingClientRect(),
        className: "pt-4",
        tagName: "div",
      },
    });

    const badge = createMockBadgeHit({ value: 16, prefix: "pt" });
    badgeHitsRef.current = [badge];

    renderHook(() => useSpacingDrag(badgeHitsRef, tagBadgeHitRef));

    // Start drag
    document.dispatchEvent(new MouseEvent("mousedown", {
      clientX: 110, clientY: 107, bubbles: true,
    }));

    // Move DOWN by 24px screen-space (toward center = increase top padding)
    // Direction: for top, dragging down (clientY increases) = increase spacing
    document.dispatchEvent(new MouseEvent("mousemove", {
      clientX: 110, clientY: 131, bubbles: true, // 107 + 24 = 131
    }));

    // delta = clientY - startY = 131 - 107 = 24 screen px
    // newPx = max(0, round(16 + 24/2)) = max(0, round(28)) = 28
    expect(mockEl.style.paddingTop).toBe("28px");
  });
});
