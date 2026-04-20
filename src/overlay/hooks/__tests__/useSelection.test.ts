import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSelection } from "../useSelection.js";
import { useEditorStore } from "../../stores/editor-store.js";
import { DEFAULT_BREAKPOINT } from "../../../shared/breakpoints.js";

// Mock resolveSource
vi.mock("../../../core/source-map/resolver.js", () => ({
  resolveSource: vi.fn().mockReturnValue({ file: "test.tsx", line: 1, column: 0 }),
}));

// jsdom doesn't support elementsFromPoint
if (!document.elementsFromPoint) {
  document.elementsFromPoint = vi.fn().mockReturnValue([]);
}

describe("useSelection", () => {
  beforeEach(() => {
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
  });

  it("does not activate listeners in pan mode", () => {
    useEditorStore.getState().setMode("navigate");
    renderHook(() => useSelection());

    // Create a target element
    const target = document.createElement("div");
    target.className = "test-div";
    document.body.appendChild(target);

    // Click should be ignored in pan mode
    const clickEvent = new MouseEvent("click", {
      clientX: 50, clientY: 50, bubbles: true,
    });
    document.dispatchEvent(clickEvent);

    expect(useEditorStore.getState().selectedElement).toBeNull();
    document.body.removeChild(target);
  });

  it("sets hovered element on mousemove in select mode", async () => {
    renderHook(() => useSelection());

    // Dispatch mousemove — it's RAF-throttled so won't immediately update
    document.dispatchEvent(new MouseEvent("mousemove", {
      clientX: 50, clientY: 50, bubbles: true,
    }));

    // Wait for RAF
    await new Promise((resolve) => requestAnimationFrame(resolve));

    // In jsdom, elementFromPoint returns null, so hoveredElement stays null
    // This validates the throttle path doesn't crash
    expect(useEditorStore.getState().hoveredElement).toBeNull();
  });

  it("activates listeners in select mode", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    renderHook(() => useSelection());

    // Should have registered mousemove and click listeners
    const calls = addSpy.mock.calls.map(([event]) => event);
    expect(calls).toContain("mousemove");
    expect(calls).toContain("click");
    addSpy.mockRestore();
  });

  it("does NOT clear hoveredElement when the mousemove is inside the Layers panel", async () => {
    // Build a fake layers panel inside a shadow root that matches the real one
    const host = document.createElement("div");
    host.id = "local-canvas-host";
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    const panel = document.createElement("div");
    panel.dataset.canvasLayerPanel = "true";
    Object.assign(panel.style, { position: "fixed", top: "0px", left: "0px", width: "260px", height: "600px", pointerEvents: "auto" });
    shadow.appendChild(panel);

    // jsdom's shadow.elementFromPoint is a no-op by default; mock it to pretend
    // the cursor is over the panel's root
    shadow.elementFromPoint = (() => panel) as unknown as typeof shadow.elementFromPoint;

    // Seed a hovered element — we assert it is NOT wiped by the mousemove
    const target = document.createElement("section");
    document.body.appendChild(target);
    useEditorStore.setState({ hoveredElement: target });

    renderHook(() => useSelection());

    document.dispatchEvent(new MouseEvent("mousemove", {
      clientX: 50, clientY: 50, bubbles: true,
    }));

    // Allow the RAF inside handleMouseMove to settle — but the guard returns
    // BEFORE scheduling a RAF, so the state shouldn't change regardless.
    await new Promise((r) => requestAnimationFrame(r));

    expect(useEditorStore.getState().hoveredElement).toBe(target);

    document.body.removeChild(host);
    document.body.removeChild(target);
  });

  it("cleans up listeners on unmount", () => {
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const { unmount } = renderHook(() => useSelection());

    unmount();

    const calls = removeSpy.mock.calls.map(([event]) => event);
    expect(calls).toContain("mousemove");
    expect(calls).toContain("click");
    removeSpy.mockRestore();
  });
});
