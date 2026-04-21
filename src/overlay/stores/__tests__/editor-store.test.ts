import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore } from "../editor-store.js";
import { DEFAULT_BREAKPOINT } from "../../../shared/breakpoints.js";

describe("useEditorStore", () => {
  beforeEach(() => {
    useEditorStore.setState({
      mode: "navigate",
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
});
