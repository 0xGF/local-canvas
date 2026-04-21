import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { AlignmentPicker } from "../alignment-picker.js";

afterEach(cleanup);

describe("AlignmentPicker", () => {
  it("renders a 3x3 grid of align buttons", () => {
    const { getAllByRole } = render(
      <AlignmentPicker direction="row" justify="start" align="start" onChange={() => {}} />,
    );
    expect(getAllByRole("button")).toHaveLength(9);
  });

  it("highlights the cell matching justify+align as pressed (row direction)", () => {
    render(
      <AlignmentPicker direction="row" justify="center" align="end" onChange={() => {}} />,
    );
    const active = screen.getByRole("button", { name: /align center end/i });
    expect(active.getAttribute("aria-pressed")).toBe("true");
  });

  it("emits justify, align in row direction on click", () => {
    const onChange = vi.fn();
    render(
      <AlignmentPicker direction="row" justify="start" align="start" onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /align end center/i }));
    // row → (x=end, y=center) means justify=end, align=center
    expect(onChange).toHaveBeenCalledWith("end", "center");
  });

  it("swaps axes when direction is 'col'", () => {
    const onChange = vi.fn();
    render(
      <AlignmentPicker direction="col" justify="start" align="start" onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /align end center/i }));
    // col → (x=end, y=center) means align=end, justify=center
    expect(onChange).toHaveBeenCalledWith("center", "end");
  });
});
