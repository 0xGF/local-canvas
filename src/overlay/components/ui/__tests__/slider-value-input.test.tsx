import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { SliderValueInput } from "../slider-value-input.js";
import { LENGTH, ANGLE, NUMBER } from "../value-input.parsers.js";

afterEach(cleanup);

function getInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector("input");
  if (!input) throw new Error("no input found");
  return input as HTMLInputElement;
}

describe("SliderValueInput", () => {
  it("renders with slider track + free-entry input", () => {
    const { container } = render(
      <SliderValueInput
        label="Radius"
        value="[16px]"
        sliderValue={16}
        min={0} max={100}
        onChange={() => {}}
      />
    );
    // Input shows the unbracketed value
    expect(getInput(container).value).toBe("16px");
    // Slider track is a div
    expect(container.querySelectorAll("div").length).toBeGreaterThan(0);
  });

  it("typing in the input commits the parsed Tailwind value", () => {
    const onChange = vi.fn();
    const { container } = render(
      <SliderValueInput
        label="X"
        value=""
        sliderValue={0}
        min={-100} max={100}
        strategy={LENGTH}
        onChange={onChange}
      />
    );
    const input = getInput(container);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "1.5rem" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith("[1.5rem]");
  });

  it("uses a custom encode() when the slider commits (drag mock)", () => {
    const onChange = vi.fn();
    const encode = (n: number) => n === 0 ? "" : `[${n}deg]`;
    const { container } = render(
      <SliderValueInput
        label="Rotate"
        value=""
        sliderValue={0}
        min={-180} max={180}
        strategy={ANGLE}
        encode={encode}
        onChange={onChange}
      />
    );
    // simulate a slider drag end: mousedown on track → mousemove → mouseup
    const track = container.querySelector("div > div > div")!;  // label, track parent
    // the slider track is identifiable by its "cursor: pointer" style — use query
    // of all divs and pick the one with cursor pointer
    const divs = Array.from(container.querySelectorAll("div")) as HTMLDivElement[];
    const trackEl = divs.find(d => d.style.cursor === "pointer");
    expect(trackEl).toBeDefined();
    // stub getBoundingClientRect on the track so calc() has real dimensions
    Object.defineProperty(trackEl!, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, right: 200, bottom: 4, width: 200, height: 4, x: 0, y: 0, toJSON: () => ({}) }),
    });
    fireEvent.mouseDown(trackEl!, { clientX: 100 });  // midway → value 0
    fireEvent(document, new MouseEvent("mousemove", { clientX: 200, bubbles: true }));  // far right → 180
    fireEvent(document, new MouseEvent("mouseup", { clientX: 200, bubbles: true }));
    expect(onChange).toHaveBeenCalled();
    const emitted = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(emitted).toBe("[180deg]");
    void track;
  });

  it("percentage encoder passes typed arbitrary through", () => {
    const onChange = vi.fn();
    const { container } = render(
      <SliderValueInput
        label="Scale"
        value=""
        sliderValue={100}
        min={0} max={200}
        strategy={NUMBER}
        encode={n => n === 100 ? "" : String(n)}
        onChange={onChange}
        suffix="%"
      />
    );
    const input = getInput(container);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "150" } });
    fireEvent.blur(input);
    // Typed "150" via NUMBER → "[150]" (not using encode, since typing bypasses slider)
    expect(onChange).toHaveBeenCalledWith("[150]");
  });

  it("shows label when provided", () => {
    const { container } = render(
      <SliderValueInput
        label="Blur"
        value=""
        sliderValue={0}
        min={0} max={64}
        onChange={() => {}}
      />
    );
    expect(container.textContent).toContain("Blur");
  });
});
