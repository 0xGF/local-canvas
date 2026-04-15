import { describe, it, expect, beforeEach } from "vitest";
import { measureText, clearAllCaches } from "../style-cache.js";

describe("measureText (pretext wrapper)", () => {
  beforeEach(() => {
    clearAllCaches();
  });

  it("reports line count and height for short text that fits on one line", () => {
    const { height, lineCount } = measureText("short", "11px Inter", 400, 15);
    expect(lineCount).toBe(1);
    expect(height).toBe(15);
  });

  it("wraps long text into multiple lines at a narrow width", () => {
    const longText = "this is a noticeably long comment that should definitely need to wrap across multiple lines when squeezed";
    const narrow = measureText(longText, "11px Inter", 80, 15);
    const wide = measureText(longText, "11px Inter", 600, 15);
    expect(narrow.lineCount).toBeGreaterThan(wide.lineCount);
    expect(narrow.lineCount).toBeGreaterThan(1);
    expect(narrow.height).toBe(narrow.lineCount * 15);
  });

  it("returns the same result for repeated measurements of the same text (cache hit)", () => {
    const a = measureText("cached value", "12px Inter", 200, 16);
    const b = measureText("cached value", "12px Inter", 200, 16);
    expect(b).toEqual(a);
  });

  it("respects the lineHeight parameter — 2 lines at 20px lineHeight is 40px tall", () => {
    // Pick a width narrow enough to force wrapping
    const { height, lineCount } = measureText("aaaa bbbb cccc dddd eeee ffff gggg hhhh", "11px Inter", 60, 20);
    expect(lineCount).toBeGreaterThanOrEqual(2);
    expect(height).toBe(lineCount * 20);
  });
});
