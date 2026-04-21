import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Subheader } from "../subheader.js";

afterEach(cleanup);

describe("Subheader", () => {
  it("renders the heading text", () => {
    const { getByText } = render(<Subheader>Flex</Subheader>);
    expect(getByText("Flex")).toBeTruthy();
  });

  it("renders action slot when provided", () => {
    const { getByText } = render(
      <Subheader actions={<button type="button">+</button>}>Flex</Subheader>,
    );
    expect(getByText("+")).toBeTruthy();
  });

  it("does not render an action container when no actions given", () => {
    const { container } = render(<Subheader>Flex</Subheader>);
    // Only the label span should be present; no trailing action row.
    expect(container.querySelectorAll("button").length).toBe(0);
  });
});
