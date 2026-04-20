import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useEditorStore } from "../../stores/editor-store.js";
import { DEFAULT_BREAKPOINT } from "../../../shared/breakpoints.js";

// Mock useWebSocket
const mockSend = vi.fn().mockResolvedValue({});
vi.mock("../useWebSocket.js", () => ({
  useWebSocket: () => ({
    send: mockSend,
    sendMutation: vi.fn().mockResolvedValue({}),
    undo: vi.fn(),
    redo: vi.fn(),
  }),
}));

describe("useKeyboard shortcuts", () => {
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
    mockSend.mockClear();
  });

  it("Escape clears selection", async () => {
    const mockEl = document.createElement("div");
    useEditorStore.getState().selectElement({
      element: mockEl,
      source: null,
      rect: mockEl.getBoundingClientRect(),
      className: "",
      tagName: "div",
    });

    // Import hook after mocks are set up
    const { useKeyboard } = await import("../useKeyboard.js");
    renderHook(() => useKeyboard());

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(useEditorStore.getState().selectedElement).toBeNull();
  });

  it("C key switches to canvas (edit) mode", async () => {
    useEditorStore.getState().setMode("navigate");
    expect(useEditorStore.getState().mode).toBe("navigate");

    const { useKeyboard } = await import("../useKeyboard.js");
    renderHook(() => useKeyboard());

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true }));

    expect(useEditorStore.getState().mode).toBe("edit");
  });

  it("does not trigger shortcuts when typing in input", async () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    const { useKeyboard } = await import("../useKeyboard.js");
    renderHook(() => useKeyboard());

    // Dispatch on the input — matches real-world bubbling, and makes
    // composedPath()[0] the input (isTyping uses composedPath first so it
    // can see through shadow DOM; jsdom's composedPath ignores a manually
    // re-defined .target, so we must dispatch where the event really originates).
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true }));

    // Should NOT have changed mode since we're typing
    expect(useEditorStore.getState().mode).toBe("navigate");
    document.body.removeChild(input);
  });
});
