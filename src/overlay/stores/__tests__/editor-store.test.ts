import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore } from "../editor-store.js";

describe("useEditorStore", () => {
  beforeEach(() => {
    // Reset store to initial state
    useEditorStore.setState({
      mode: "navigate",
      selectedElement: null,
      hoveredElement: null,
      propertiesOpen: false,
      paletteOpen: false,
      commandBarOpen: false,
      connected: false,
      toolbarVisible: true,
      breakpoint: null,
      pendingCount: 0,
    });
  });

  it("has correct initial state", () => {
    const state = useEditorStore.getState();
    expect(state.mode).toBe("navigate");
    expect(state.selectedElement).toBeNull();
    expect(state.breakpoint).toBeNull();
    expect(state.pendingCount).toBe(0);
  });

  it("setMode changes mode", () => {
    useEditorStore.getState().setMode("edit");
    expect(useEditorStore.getState().mode).toBe("edit");
  });

  it("selectElement sets selection and opens properties", () => {
    const mockEl = document.createElement("div");
    const sel = {
      element: mockEl,
      source: null,
      rect: mockEl.getBoundingClientRect(),
      className: "flex",
      tagName: "div",
    };
    useEditorStore.getState().selectElement(sel);
    const state = useEditorStore.getState();
    expect(state.selectedElement).toBe(sel);
    expect(state.propertiesOpen).toBe(true);
  });

  it("selectElement(null) clears selection", () => {
    useEditorStore.getState().selectElement(null);
    const state = useEditorStore.getState();
    expect(state.selectedElement).toBeNull();
    expect(state.propertiesOpen).toBe(false);
  });

  it("setBreakpoint sets breakpoint and preserves selection", () => {
    // First select something
    const mockEl = document.createElement("div");
    useEditorStore.getState().selectElement({
      element: mockEl,
      source: null,
      rect: mockEl.getBoundingClientRect(),
      className: "",
      tagName: "div",
    });
    expect(useEditorStore.getState().selectedElement).not.toBeNull();

    useEditorStore.getState().setBreakpoint(768);
    const state = useEditorStore.getState();
    expect(state.breakpoint).toBe(768);
    // Selection preserved — responsive preview resizes in-place
    expect(state.selectedElement).not.toBeNull();
  });

  it("setBreakpoint(null) clears breakpoint", () => {
    useEditorStore.getState().setBreakpoint(768);
    expect(useEditorStore.getState().breakpoint).toBe(768);
    useEditorStore.getState().setBreakpoint(null);
    expect(useEditorStore.getState().breakpoint).toBeNull();
  });

  it("incrementPending and clearPending", () => {
    useEditorStore.getState().incrementPending();
    useEditorStore.getState().incrementPending();
    expect(useEditorStore.getState().pendingCount).toBe(2);
    useEditorStore.getState().clearPending();
    expect(useEditorStore.getState().pendingCount).toBe(0);
  });

  it("setConnected", () => {
    useEditorStore.getState().setConnected(true);
    expect(useEditorStore.getState().connected).toBe(true);
    useEditorStore.getState().setConnected(false);
    expect(useEditorStore.getState().connected).toBe(false);
  });

  it("toggleProperties", () => {
    expect(useEditorStore.getState().propertiesOpen).toBe(false);
    useEditorStore.getState().toggleProperties();
    expect(useEditorStore.getState().propertiesOpen).toBe(true);
    useEditorStore.getState().toggleProperties();
    expect(useEditorStore.getState().propertiesOpen).toBe(false);
  });

  it("togglePalette", () => {
    expect(useEditorStore.getState().paletteOpen).toBe(false);
    useEditorStore.getState().togglePalette();
    expect(useEditorStore.getState().paletteOpen).toBe(true);
    useEditorStore.getState().togglePalette();
    expect(useEditorStore.getState().paletteOpen).toBe(false);
  });
});
