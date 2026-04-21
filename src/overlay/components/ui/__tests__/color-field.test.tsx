import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { ColorField } from "../color-field.js";

afterEach(cleanup);

function getInput(c: HTMLElement): HTMLInputElement {
  const i = c.querySelector("input");
  if (!i) throw new Error("input not found");
  return i as HTMLInputElement;
}

describe("ColorField", () => {
  it("formats an incoming hex value as 'HEX / 100%'", () => {
    const { container } = render(
      <ColorField value="#FF0000" onChange={() => {}} />,
    );
    expect(getInput(container).value.toUpperCase()).toContain("FF0000");
    expect(getInput(container).value).toContain("100");
  });

  it("preserves alpha when value is rgba", () => {
    const { container } = render(
      <ColorField value="rgba(255, 0, 0, 0.5)" onChange={() => {}} />,
    );
    expect(getInput(container).value).toMatch(/50%/);
  });

  it("commits a typed hex on Enter and fires onChange", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ColorField value="#000000" onChange={onChange} />,
    );
    const input = getInput(container);
    fireEvent.change(input, { target: { value: "00FF00" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalled();
    const arg = onChange.mock.calls[0][0] as string;
    expect(arg.toLowerCase()).toContain("#00ff00");
  });
});
