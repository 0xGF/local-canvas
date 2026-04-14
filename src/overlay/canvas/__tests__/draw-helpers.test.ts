import { describe, it, expect } from "vitest";
import { pxToTw } from "../draw-helpers.js";

describe("pxToTw", () => {
  it("returns '0' for 0", () => {
    expect(pxToTw(0)).toBe("0");
  });

  it("returns '1' for 4px", () => {
    expect(pxToTw(4)).toBe("1");
  });

  it("returns '4' for 16px", () => {
    expect(pxToTw(16)).toBe("4");
  });

  it("returns '2' for 8px", () => {
    expect(pxToTw(8)).toBe("2");
  });

  it("returns arbitrary value for 18px (not within 1px of any TW value)", () => {
    expect(pxToTw(18)).toBe("[18px]");
  });

  it("returns '8' for 32px", () => {
    expect(pxToTw(32)).toBe("8");
  });

  it("returns '0' for negative values", () => {
    expect(pxToTw(-5)).toBe("0");
  });

  it("does NOT snap 15px to a Tailwind value (pixel-accurate)", () => {
    expect(pxToTw(15)).toBe("[15px]");
  });

  it("does NOT snap 17px to 16px", () => {
    expect(pxToTw(17)).toBe("[17px]");
  });

  it("does NOT snap 13px to 12 or 14", () => {
    expect(pxToTw(13)).toBe("[13px]");
  });

  it("uses exact Tailwind class for 14px", () => {
    expect(pxToTw(14)).toBe("3.5");
  });
});
