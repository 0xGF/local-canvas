import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { LinkedInput } from "../linked-input.js";

afterEach(cleanup);

describe("LinkedInput", () => {
  it("toggles mode on click", () => {
    const onModeChange = vi.fn();
    render(
      <LinkedInput mode="linked" onModeChange={onModeChange} splitIcon={<span>S</span>}>
        {() => <div>body</div>}
      </LinkedInput>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onModeChange).toHaveBeenCalledWith("split");
  });
});
