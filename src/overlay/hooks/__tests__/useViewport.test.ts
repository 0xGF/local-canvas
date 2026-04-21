import { describe, it, expect, beforeEach } from "vitest";
import { useViewportStore } from "../useViewport.js";

describe("useViewportStore", () => {
  beforeEach(() => {
    useViewportStore.setState({ zoom: 1, panX: 0, panY: 0 });
  });

  it("clamps zoom to minimum 0.1", () => {
    useViewportStore.getState().setZoom(0.05);
    expect(useViewportStore.getState().zoom).toBe(0.1);
  });

  it("clamps zoom to maximum 5", () => {
    useViewportStore.getState().setZoom(6);
    expect(useViewportStore.getState().zoom).toBe(5);
  });

  it("computes zoom-toward-cursor correctly", () => {
    // Start at zoom=1, pan=(0,0), zoom to 2 with cursor at (100,100)
    useViewportStore.getState().setZoom(2, 100, 100);
    const state = useViewportStore.getState();
    expect(state.zoom).toBe(2);
    // scale = 2/1 = 2
    // panX = 100 - 2*(100 - 0) = 100 - 200 = -100
    // panY = 100 - 2*(100 - 0) = 100 - 200 = -100
    expect(state.panX).toBe(-100);
    expect(state.panY).toBe(-100);
  });

  it("reset restores defaults", () => {
    useViewportStore.getState().setZoom(3);
    useViewportStore.getState().setPan(50, 100);
    useViewportStore.getState().reset();
    const state = useViewportStore.getState();
    expect(state.zoom).toBe(1);
    expect(state.panX).toBe(0);
    expect(state.panY).toBe(0);
  });

});
