import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { GradientEditor, gradientToCss, type GradientValue } from "../gradient-editor.js";

afterEach(cleanup);

const base: GradientValue = {
  type: "linear",
  angle: 90,
  stops: [
    { position: 0, color: "#FFFFFF" },
    { position: 100, color: "#000000" },
  ],
};

describe("gradientToCss", () => {
  it("serializes a linear gradient", () => {
    expect(gradientToCss(base)).toBe("linear-gradient(90deg, #FFFFFF 0%, #000000 100%)");
  });

  it("serializes a radial gradient", () => {
    expect(gradientToCss({ ...base, type: "radial" }))
      .toBe("radial-gradient(circle, #FFFFFF 0%, #000000 100%)");
  });

  it("sorts stops by position before serializing", () => {
    const out = gradientToCss({
      ...base,
      stops: [
        { position: 100, color: "#000000" },
        { position: 0, color: "#FFFFFF" },
      ],
    });
    expect(out.indexOf("#FFFFFF")).toBeLessThan(out.indexOf("#000000"));
  });
});

describe("GradientEditor", () => {
  it("adds a stop when 'Add stop' is clicked", () => {
    const onChange = vi.fn();
    render(<GradientEditor value={base} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Add gradient stop"));
    const next = onChange.mock.calls[0][0] as GradientValue;
    expect(next.stops).toHaveLength(3);
  });

  it("removes a stop when the trash button is clicked (if >2 stops)", () => {
    const onChange = vi.fn();
    const three: GradientValue = {
      ...base,
      stops: [
        { position: 0, color: "#FF0000" },
        { position: 50, color: "#00FF00" },
        { position: 100, color: "#0000FF" },
      ],
    };
    render(<GradientEditor value={three} onChange={onChange} />);
    const removeButtons = screen.getAllByLabelText("Remove stop");
    fireEvent.click(removeButtons[1]);
    const next = onChange.mock.calls[0][0] as GradientValue;
    expect(next.stops).toHaveLength(2);
    expect(next.stops.find(s => s.color === "#00FF00")).toBeUndefined();
  });

  it("refuses to remove when only 2 stops exist (gradients require ≥2)", () => {
    const onChange = vi.fn();
    render(<GradientEditor value={base} onChange={onChange} />);
    const removeButtons = screen.getAllByLabelText("Remove stop");
    fireEvent.click(removeButtons[0]);
    // pointer-events-none + internal guard → no onChange should fire
    expect(onChange).not.toHaveBeenCalled();
  });

  it("hides the angle field for radial gradients", () => {
    const { queryByTitle } = render(
      <GradientEditor value={{ ...base, type: "radial" }} onChange={() => {}} />,
    );
    expect(queryByTitle("Gradient angle (degrees)")).toBeNull();
  });
});
