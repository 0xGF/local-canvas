import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { LinkedInput } from "../linked-input.js";

afterEach(cleanup);

describe("LinkedInput", () => {
  it("passes the current mode to the render-prop child", () => {
    const spy = vi.fn(() => <div>body</div>);
    render(
      <LinkedInput mode="linked" onModeChange={() => {}} splitIcon={<span>S</span>}>
        {spy}
      </LinkedInput>,
    );
    expect(spy).toHaveBeenCalledWith("linked");
  });

  it("toggles from linked to split on click", () => {
    const onModeChange = vi.fn();
    render(
      <LinkedInput mode="linked" onModeChange={onModeChange} splitIcon={<span data-testid="icn">S</span>}>
        {() => <div>body</div>}
      </LinkedInput>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onModeChange).toHaveBeenCalledWith("split");
  });

  it("toggles from split to linked on click", () => {
    const onModeChange = vi.fn();
    render(
      <LinkedInput mode="split" onModeChange={onModeChange} splitIcon={<span>S</span>} linkIcon={<span>L</span>}>
        {() => <div>body</div>}
      </LinkedInput>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onModeChange).toHaveBeenCalledWith("linked");
  });

  it("swaps the icon based on mode", () => {
    const { getByText, rerender } = render(
      <LinkedInput mode="linked" onModeChange={() => {}} splitIcon={<span>SPLIT</span>} linkIcon={<span>LINK</span>}>
        {() => <div>body</div>}
      </LinkedInput>,
    );
    expect(getByText("SPLIT")).toBeTruthy();
    rerender(
      <LinkedInput mode="split" onModeChange={() => {}} splitIcon={<span>SPLIT</span>} linkIcon={<span>LINK</span>}>
        {() => <div>body</div>}
      </LinkedInput>,
    );
    expect(getByText("LINK")).toBeTruthy();
  });
});
