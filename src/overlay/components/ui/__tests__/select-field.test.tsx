import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { SelectField } from "../select-field.js";

const OPTS = [
  { value: "a", label: "Option A" },
  { value: "b", label: "Option B" },
  { value: "c", label: "Option C" },
];

afterEach(cleanup);

describe("SelectField", () => {
  it("shows the current option's label when closed", () => {
    const { getByRole } = render(
      <SelectField value="b" options={OPTS} onChange={() => {}} />,
    );
    // The main button (listbox trigger) shows the label.
    expect(getByRole("button", { name: /option b/i })).toBeTruthy();
  });

  it("falls back to placeholder when value matches no option", () => {
    const { container } = render(
      <SelectField value="" options={OPTS} onChange={() => {}} placeholder="Pick one" />,
    );
    expect(container.textContent).toContain("Pick one");
  });

  it("opens a listbox on click and emits onChange when an option is clicked", () => {
    const onChange = vi.fn();
    render(<SelectField value="a" options={OPTS} onChange={onChange} />);
    // Open the dropdown.
    fireEvent.click(screen.getByRole("button", { name: /option a/i }));
    const optionB = screen.getByRole("option", { name: /option b/i });
    fireEvent.click(optionB);
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("prefers displayOverride over the matched option label", () => {
    const { container } = render(
      <SelectField value="a" options={OPTS} onChange={() => {}} displayOverride="Mixed" />,
    );
    expect(container.textContent).toContain("Mixed");
  });

  it("renders separator markers as horizontal dividers inside the dropdown", () => {
    render(
      <SelectField
        value="a"
        options={[
          { value: "a", label: "Option A" },
          { separator: true },
          { value: "b", label: "Option B" },
        ]}
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /option a/i }));
    // The separator renders as a role="separator" div inside the open listbox.
    const seps = screen.getAllByRole("separator");
    expect(seps.length).toBe(1);
    // Both real options still render as options.
    expect(screen.getAllByRole("option").length).toBe(2);
  });
});
