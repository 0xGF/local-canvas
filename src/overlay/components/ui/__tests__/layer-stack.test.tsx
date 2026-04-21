import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { LayerStack, type LayerControl } from "../layer-stack.js";

afterEach(cleanup);

type FillData = { color: string };

const LAYERS: LayerControl<FillData>[] = [
  { id: "a", data: { color: "red" }, visible: true },
  { id: "b", data: { color: "blue" }, visible: false },
];

describe("LayerStack", () => {
  it("renders each layer via the render-prop", () => {
    const { getByText } = render(
      <LayerStack
        layers={LAYERS}
        onVisibilityChange={() => {}}
        onRemove={() => {}}
        renderLayer={(l) => <span>color-{l.data.color}</span>}
      />,
    );
    expect(getByText("color-red")).toBeTruthy();
    expect(getByText("color-blue")).toBeTruthy();
  });

  it("calls onVisibilityChange with flipped visibility", () => {
    const onVis = vi.fn();
    render(
      <LayerStack
        layers={LAYERS}
        onVisibilityChange={onVis}
        onRemove={() => {}}
        renderLayer={() => <span>x</span>}
      />,
    );
    // First layer is visible → accessible name should be "Hide".
    const hideBtn = screen.getAllByLabelText("Hide")[0];
    fireEvent.click(hideBtn);
    expect(onVis).toHaveBeenCalledWith("a", false);
  });

  it("calls onRemove with the layer id when remove is clicked", () => {
    const onRemove = vi.fn();
    render(
      <LayerStack
        layers={LAYERS}
        onVisibilityChange={() => {}}
        onRemove={onRemove}
        renderLayer={() => <span>x</span>}
      />,
    );
    const removeBtns = screen.getAllByLabelText("Remove");
    fireEvent.click(removeBtns[1]);
    expect(onRemove).toHaveBeenCalledWith("b");
  });

  it("shows hidden layers with reduced opacity", () => {
    const { container } = render(
      <LayerStack
        layers={LAYERS}
        onVisibilityChange={() => {}}
        onRemove={() => {}}
        renderLayer={() => <span>x</span>}
      />,
    );
    const rows = container.querySelectorAll<HTMLDivElement>(".flex.flex-col.gap-1\\.5");
    // Second layer (hidden) should have the opacity-50 class somewhere up its row tree.
    const hiddenRowHasOpacity = Array.from(rows).some(r => r.className.includes("opacity-50"));
    expect(hiddenRowHasOpacity).toBe(true);
  });
});
