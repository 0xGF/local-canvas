import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useEditorStore } from "../../stores/editor-store.js";

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
      breakpoint: null,
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

  it("V key switches to edit mode", async () => {
    useEditorStore.getState().setMode("navigate");
    expect(useEditorStore.getState().mode).toBe("navigate");

    const { useKeyboard } = await import("../useKeyboard.js");
    renderHook(() => useKeyboard());

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "v", bubbles: true }));

    expect(useEditorStore.getState().mode).toBe("edit");
  });

  it("V key switches to edit mode", async () => {
    expect(useEditorStore.getState().mode).toBe("navigate");

    const { useKeyboard } = await import("../useKeyboard.js");
    renderHook(() => useKeyboard());

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "v", bubbles: true }));

    expect(useEditorStore.getState().mode).toBe("edit");
  });

  it("does not trigger shortcuts when typing in input", async () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    const { useKeyboard } = await import("../useKeyboard.js");
    renderHook(() => useKeyboard());

    const event = new KeyboardEvent("keydown", { key: "v", bubbles: true });
    Object.defineProperty(event, "target", { value: input });
    document.dispatchEvent(event);

    // Should NOT have changed mode since we're typing
    expect(useEditorStore.getState().mode).toBe("navigate");
    document.body.removeChild(input);
  });
});
