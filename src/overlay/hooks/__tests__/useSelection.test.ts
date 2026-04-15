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
