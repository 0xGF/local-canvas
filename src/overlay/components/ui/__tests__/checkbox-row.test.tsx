import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { CheckboxRow } from "../checkbox-row.js";

afterEach(cleanup);

describe("CheckboxRow", () => {
  it("renders the label text", () => {
    const { getByText } = render(
      <CheckboxRow checked={false} onChange={() => {}} label="Clip content" />,
    );
    expect(getByText("Clip content")).toBeTruthy();
  });

  it("reflects checked state via aria-checked", () => {
    const { getByRole, rerender } = render(
      <CheckboxRow checked={false} onChange={() => {}} label="x" />,
    );
    expect(getByRole("checkbox").getAttribute("aria-checked")).toBe("false");
    rerender(<CheckboxRow checked={true} onChange={() => {}} label="x" />);
    expect(getByRole("checkbox").getAttribute("aria-checked")).toBe("true");
  });

  it("calls onChange with toggled value when clicked", () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <CheckboxRow checked={false} onChange={onChange} label="x" />,
    );
    fireEvent.click(getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("renders kbd hint when provided", () => {
    render(<CheckboxRow checked={false} onChange={() => {}} label="x" kbd="⌥C" />);
    expect(screen.getByText("⌥C")).toBeTruthy();
  });
});
