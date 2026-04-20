import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { ValueInput } from "../value-input.js";
import { LENGTH, INTEGER, KEYWORD, GRID_COLS } from "../value-input.parsers.js";

const SIZE_PRESETS = [
  { value: "", label: "Auto" },
  { value: "full", label: "100%" },
  { value: "1/2", label: "50%" },
];

const Z_PRESETS = [
  { value: "", label: "Auto" },
  { value: "10", label: "10" },
  { value: "50", label: "50" },
];

const SHADOW_PRESETS = [
  { value: "none", label: "none" },
  { value: "md", label: "md" },
  { value: "inner", label: "inner" },
];

afterEach(cleanup);

function getInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector("input");
  if (!input) throw new Error("no input found");
  return input as HTMLInputElement;
}

describe("ValueInput — formatting", () => {
  it("shows preset label when value matches a preset", () => {
    const { container } = render(
      <ValueInput value="full" presets={SIZE_PRESETS} onChange={() => {}} strategy={LENGTH} />
    );
    expect(getInput(container).value).toBe("100%");
  });

  it("shows bracketed value's inner content", () => {
    const { container } = render(
      <ValueInput value="[27px]" onChange={() => {}} strategy={LENGTH} />
    );
    expect(getInput(container).value).toBe("27px");
  });

  it("shows empty string when value is empty (placeholder visible)", () => {
    const { container } = render(
      <ValueInput value="" presets={SIZE_PRESETS} onChange={() => {}} strategy={LENGTH} placeholder="auto" />
    );
    expect(getInput(container).value).toBe("");
    expect(getInput(container).placeholder).toBe("auto");
  });
});

describe("ValueInput — commit on blur", () => {
  it("emits bracketed [27px] when user types '27'", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ValueInput value="" onChange={onChange} strategy={LENGTH} />
    );
    const input = getInput(container);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "27" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith("[27px]");
  });

  it("emits preset value when user types preset label", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ValueInput value="" presets={SIZE_PRESETS} onChange={onChange} strategy={LENGTH} />
    );
    const input = getInput(container);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "50%" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith("1/2");
  });

  it("emits arbitrary rem value", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ValueInput value="" onChange={onChange} strategy={LENGTH} />
    );
    const input = getInput(container);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "1.5rem" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith("[1.5rem]");
  });

  it("emits negative bracket value", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ValueInput value="" onChange={onChange} strategy={LENGTH} />
    );
    const input = getInput(container);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "-12px" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith("[-12px]");
  });

  it("emits empty to clear the value when input is cleared", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ValueInput value="full" presets={SIZE_PRESETS} onChange={onChange} strategy={LENGTH} />
    );
    const input = getInput(container);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("does NOT fire onChange when value did not change", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ValueInput value="full" presets={SIZE_PRESETS} onChange={onChange} strategy={LENGTH} />
    );
    const input = getInput(container);
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Escape cancels pending edit", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ValueInput value="full" presets={SIZE_PRESETS} onChange={onChange} strategy={LENGTH} />
    );
    const input = getInput(container);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "garbage" } });
    fireEvent.keyDown(input, { key: "Escape" });
    // After Escape blurs and restores, no onChange should fire
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Enter commits and blurs", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ValueInput value="" onChange={onChange} strategy={LENGTH} />
    );
    const input = getInput(container);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "50%" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("[50%]");
  });
});

describe("ValueInput — integer strategy (z-index)", () => {
  it("arbitrary integer becomes [999]", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ValueInput value="" presets={Z_PRESETS} onChange={onChange} strategy={INTEGER} />
    );
    const input = getInput(container);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "999" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith("[999]");
  });

  it("preset '10' stays bare", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ValueInput value="" presets={Z_PRESETS} onChange={onChange} strategy={INTEGER} />
    );
    const input = getInput(container);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "10" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith("10");
  });

  it("negative -1 supported", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ValueInput value="" onChange={onChange} strategy={INTEGER} />
    );
    const input = getInput(container);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "-1" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith("[-1]");
  });
});

describe("ValueInput — keyword strategy (shadow)", () => {
  it("preset shadow 'md' stays bare", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ValueInput value="" presets={SHADOW_PRESETS} onChange={onChange} strategy={KEYWORD} />
    );
    const input = getInput(container);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "md" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith("md");
  });

  it("custom shadow is bracketed with spaces→underscores", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ValueInput value="" presets={SHADOW_PRESETS} onChange={onChange} strategy={KEYWORD} />
    );
    const input = getInput(container);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "0 4px 12px #000" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith("[0_4px_12px_#000]");
  });
});

describe("ValueInput — grid-cols strategy", () => {
  it("number 1-12 stays bare", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ValueInput value="" onChange={onChange} strategy={GRID_COLS} />
    );
    const input = getInput(container);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "7" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith("7");
  });
  it(">12 becomes repeat()", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ValueInput value="" onChange={onChange} strategy={GRID_COLS} />
    );
    const input = getInput(container);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "13" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith("[repeat(13,minmax(0,1fr))]");
  });
});

describe("ValueInput — external value sync", () => {
  it("updates displayed text when external value changes (while not focused)", () => {
    const { container, rerender } = render(
      <ValueInput value="full" presets={SIZE_PRESETS} onChange={() => {}} strategy={LENGTH} />
    );
    expect(getInput(container).value).toBe("100%");
    rerender(
      <ValueInput value="1/2" presets={SIZE_PRESETS} onChange={() => {}} strategy={LENGTH} />
    );
    expect(getInput(container).value).toBe("50%");
  });

  it("does NOT clobber in-progress typing when focused", () => {
    const { container, rerender } = render(
      <ValueInput value="" onChange={() => {}} strategy={LENGTH} />
    );
    const input = getInput(container);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "2" } });
    rerender(<ValueInput value="[8px]" onChange={() => {}} strategy={LENGTH} />);
    expect(getInput(container).value).toBe("2");
  });
});

describe("ValueInput — compact mode", () => {
  it("respects height prop for tight spacing layouts", () => {
    const { container } = render(
      <ValueInput value="[16px]" onChange={() => {}} strategy={LENGTH} height={22} />
    );
    // The inner "styled" wrapper is the input's direct parent.
    const input = getInput(container);
    const wrapper = input.parentElement as HTMLDivElement;
    expect(wrapper.style.height).toBe("22px");
  });
  it("supports center-align text", () => {
    const { container } = render(
      <ValueInput value="" onChange={() => {}} strategy={LENGTH} align="center" />
    );
    expect(getInput(container).style.textAlign).toBe("center");
  });
  it("still parses free-entry at compact size", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ValueInput value="" onChange={onChange} strategy={LENGTH} height={22} align="center" fontSize={10} />
    );
    const input = getInput(container);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "1.5rem" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith("[1.5rem]");
  });
});

describe("ValueInput — preset dropdown", () => {
  it("renders a chevron button only when presets are provided", () => {
    const { container: withPresets } = render(
      <ValueInput value="" presets={SIZE_PRESETS} onChange={() => {}} strategy={LENGTH} />
    );
    expect(withPresets.querySelector("button")).not.toBeNull();

    cleanup();

    const { container: noPresets } = render(
      <ValueInput value="" onChange={() => {}} strategy={LENGTH} />
    );
    expect(noPresets.querySelector("button")).toBeNull();
  });
});
