import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { ScrubField } from "../scrub-field.js";

afterEach(cleanup);

function getInput(c: HTMLElement): HTMLInputElement {
  const i = c.querySelector("input");
  if (!i) throw new Error("input not found");
  return i as HTMLInputElement;
}

describe("ScrubField", () => {
  it("commits typed value on Enter", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ScrubField value="12" onChange={onChange} />,
    );
    const input = getInput(container);
    fireEvent.change(input, { target: { value: "24" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("24");
  });

  it("reverts on Escape without calling onChange", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ScrubField value="12" onChange={onChange} />,
    );
    const input = getInput(container);
    fireEvent.change(input, { target: { value: "24" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("12");
  });

  it("steps on ArrowUp/ArrowDown with shift multiplier", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ScrubField value="10" onChange={onChange} />,
    );
    const input = getInput(container);
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(onChange).toHaveBeenLastCalledWith("11");
    fireEvent.keyDown(input, { key: "ArrowDown", shiftKey: true });
    // (value went to 11 locally but external remains "10"; shift ⇒ step 10)
    expect(onChange).toHaveBeenLastCalledWith("1");
  });

  it("scrolls the value up/down when wheeling over the label", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ScrubField value="10" onChange={onChange} label="W" />,
    );
    const label = container.querySelector('[role="slider"]') as HTMLElement;
    expect(label).toBeTruthy();
    // Wheel up (deltaY < 0) → increment
    fireEvent.wheel(label, { deltaY: -1 });
    expect(onChange).toHaveBeenLastCalledWith("11");
    // Wheel down with shift → step 10 down
    fireEvent.wheel(label, { deltaY: 1, shiftKey: true });
    // Local went to 11 after the first tick, so 11 - 10 = 1
    expect(onChange).toHaveBeenLastCalledWith("1");
  });

  it("ignores wheel when the value isn't numeric", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ScrubField value="auto" onChange={onChange} label="W" />,
    );
    const label = container.querySelector('[role="slider"]') as HTMLElement;
    fireEvent.wheel(label, { deltaY: -1 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows preset chevron only when presets are given", () => {
    const { container, rerender } = render(
      <ScrubField value="10" onChange={() => {}} />,
    );
    expect(container.querySelectorAll("button").length).toBe(0);
    rerender(
      <ScrubField value="10" onChange={() => {}} presets={[{ value: "auto", label: "Auto" }]} />,
    );
    expect(container.querySelectorAll("button").length).toBeGreaterThan(0);
  });
});
