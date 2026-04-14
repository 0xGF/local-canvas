import { describe, it, expect } from "vitest";
import { pxToTwScale, twValueToPx } from "../constants.js";

describe("pxToTwScale", () => {
  it("returns '0' for 0", () => {
    expect(pxToTwScale(0)).toBe("0");
  });

  it("returns '4' for 16px", () => {
    expect(pxToTwScale(16)).toBe("4");
  });

  it("returns arbitrary value for 18px", () => {
    expect(pxToTwScale(18)).toBe("[18px]");
  });

  it("does NOT snap 15px to 14 or 16 — pixel-accurate", () => {
    expect(pxToTwScale(15)).toBe("[15px]");
  });

  it("does NOT snap 17px to 16", () => {
    expect(pxToTwScale(17)).toBe("[17px]");
  });

  it("uses exact Tailwind class for 14px", () => {
    expect(pxToTwScale(14)).toBe("3.5");
  });

  it("uses exact Tailwind class for 24px", () => {
    expect(pxToTwScale(24)).toBe("6");
  });
});

describe("twValueToPx", () => {
  it("returns 16 for '4'", () => {
    expect(twValueToPx("4")).toBe(16);
  });

  it("returns 0 for '0'", () => {
    expect(twValueToPx("0")).toBe(0);
  });

  it("returns 24 for '[24px]'", () => {
    expect(twValueToPx("[24px]")).toBe(24);
  });
});
