import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useEditorStore } from "../../stores/editor-store.js";

describe("useWebSocket", () => {
  beforeEach(() => {
    useEditorStore.setState({
      connected: false,
      pendingCount: 0,
    });
  });

  it("exports expected API shape", async () => {
    const { useWebSocket } = await import("../useWebSocket.js");
    const { result } = renderHook(() => useWebSocket());

    expect(typeof result.current.send).toBe("function");
    expect(typeof result.current.sendMutation).toBe("function");
    expect(typeof result.current.undo).toBe("function");
    expect(typeof result.current.redo).toBe("function");
    expect(typeof result.current.onMessage).toBe("function");
  });
});
