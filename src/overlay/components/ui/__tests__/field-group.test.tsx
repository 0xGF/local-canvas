import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { FieldGroup } from "../field-group.js";

afterEach(cleanup);

describe("FieldGroup", () => {
  it("renders its children", () => {
    const { getByText } = render(
      <FieldGroup>
        <div>X</div>
        <div>Y</div>
        <div>Blur</div>
        <div>Spread</div>
      </FieldGroup>,
    );
    expect(getByText("X")).toBeTruthy();
    expect(getByText("Y")).toBeTruthy();
    expect(getByText("Blur")).toBeTruthy();
    expect(getByText("Spread")).toBeTruthy();
  });

  it("wraps children in a single rounded container", () => {
    const { container } = render(
      <FieldGroup>
        <div>only</div>
      </FieldGroup>,
    );
    const wrap = container.firstElementChild as HTMLElement;
    expect(wrap.className).toContain("rounded-md");
    expect(wrap.className).toContain("overflow-hidden");
  });

  it("merges a custom className onto the wrapper", () => {
    const { container } = render(
      <FieldGroup className="test-extra">
        <div>a</div>
      </FieldGroup>,
    );
    expect((container.firstElementChild as HTMLElement).className).toContain("test-extra");
  });
});
