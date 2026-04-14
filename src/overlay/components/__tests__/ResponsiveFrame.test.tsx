import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "@testing-library/react";
import { useEditorStore } from "../../stores/editor-store.js";

let appRoot: HTMLDivElement;

describe("ResponsiveFrame", () => {
  beforeEach(() => {
    appRoot = document.createElement("div");
    appRoot.id = "root";
    document.body.appendChild(appRoot);

    useEditorStore.setState({
      mode: "edit",
      selectedElement: null,
      hoveredElement: null,
      propertiesOpen: false,
      paletteOpen: false,
      commandBarOpen: false,
      connected: false,
      toolbarVisible: true,
      breakpoint: 1536,
      pendingCount: 0,
    });
  });

  afterEach(() => {
    document.body.removeChild(appRoot);
    document.body.style.background = "";
  });

  it("hides #root and renders iframe in edit mode", async () => {
    const { ResponsiveFrame } = await import("../ResponsiveFrame.js");
    const { render: rtlRender, cleanup } = await import("@testing-library/react");

    rtlRender(<ResponsiveFrame />);

    expect(appRoot.style.display).toBe("none");
    cleanup();
  });

  it("does not render in navigate mode", async () => {
    useEditorStore.setState({ mode: "navigate" });

    const { ResponsiveFrame } = await import("../ResponsiveFrame.js");
    const { render: rtlRender, cleanup } = await import("@testing-library/react");

    const { container } = rtlRender(<ResponsiveFrame />);

    expect(container.innerHTML).toBe("");
    expect(appRoot.style.display).toBe("");
    cleanup();
  });

  it("restores #root when switching to navigate", async () => {
    const { ResponsiveFrame } = await import("../ResponsiveFrame.js");
    const { render: rtlRender, cleanup } = await import("@testing-library/react");

    const { rerender } = rtlRender(<ResponsiveFrame />);
    expect(appRoot.style.display).toBe("none");

    act(() => { useEditorStore.setState({ mode: "navigate" }); });
    rerender(<ResponsiveFrame />);

    expect(appRoot.style.display).toBe("");
    cleanup();
  });

  it("shows breakpoint label", async () => {
    useEditorStore.setState({ breakpoint: 375 });

    const { ResponsiveFrame } = await import("../ResponsiveFrame.js");
    const { render: rtlRender, cleanup } = await import("@testing-library/react");

    const { container } = rtlRender(<ResponsiveFrame />);
    expect(container.textContent).toContain("375px");
    cleanup();
  });

  it("renders iframe at breakpoint width", async () => {
    useEditorStore.setState({ breakpoint: 768 });

    const { ResponsiveFrame } = await import("../ResponsiveFrame.js");
    const { render: rtlRender, cleanup } = await import("@testing-library/react");

    const { container } = rtlRender(<ResponsiveFrame />);
    const iframe = container.querySelector("iframe");
    expect(iframe).toBeTruthy();
    expect(iframe?.style.width).toBe("768px");
    cleanup();
  });
});
