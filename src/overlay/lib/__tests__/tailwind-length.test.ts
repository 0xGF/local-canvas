import { describe, it, expect } from "vitest";
import {
  radiusSuffixToPx,
  pxToRadiusSuffix,
  spacingSuffixToPx,
  pxToSpacingSuffix,
} from "../tailwind-length.js";

describe("radiusSuffixToPx", () => {
  it("maps named scale", () => {
    expect(radiusSuffixToPx("none")).toBe(0);
    expect(radiusSuffixToPx("sm")).toBe(2);
    expect(radiusSuffixToPx("")).toBe(4); // bare `rounded`
    expect(radiusSuffixToPx("md")).toBe(6);
    expect(radiusSuffixToPx("lg")).toBe(8);
    expect(radiusSuffixToPx("xl")).toBe(12);
    expect(radiusSuffixToPx("2xl")).toBe(16);
    expect(radiusSuffixToPx("3xl")).toBe(24);
    expect(radiusSuffixToPx("full")).toBe(9999);
  });

  it("decodes bracket values", () => {
    expect(radiusSuffixToPx("[13px]")).toBe(13);
    expect(radiusSuffixToPx("[4.5]")).toBe(4.5);
  });

  it("returns null for unknown suffixes", () => {
    expect(radiusSuffixToPx("bogus")).toBeNull();
    expect(radiusSuffixToPx("[50%]")).toBeNull();
  });
});

describe("pxToRadiusSuffix", () => {
  it("prefers named scale when px lines up", () => {
    expect(pxToRadiusSuffix(0)).toBe("none");
    expect(pxToRadiusSuffix(2)).toBe("sm");
    expect(pxToRadiusSuffix(4)).toBe("");
    expect(pxToRadiusSuffix(6)).toBe("md");
    expect(pxToRadiusSuffix(8)).toBe("lg");
    expect(pxToRadiusSuffix(12)).toBe("xl");
    expect(pxToRadiusSuffix(16)).toBe("2xl");
  });

  it("brackets off-scale px", () => {
    expect(pxToRadiusSuffix(13)).toBe("[13px]");
    expect(pxToRadiusSuffix(7)).toBe("[7px]");
  });

  it("clamps non-positive px to 'none'", () => {
    expect(pxToRadiusSuffix(-5)).toBe("none");
  });
});

describe("spacingSuffixToPx", () => {
  it("decodes numeric scale", () => {
    expect(spacingSuffixToPx("0")).toBe(0);
    expect(spacingSuffixToPx("1")).toBe(4);
    expect(spacingSuffixToPx("4")).toBe(16);
    expect(spacingSuffixToPx("16")).toBe(64);
  });

  it("decodes irregular scale steps", () => {
    expect(spacingSuffixToPx("px")).toBe(1);
    expect(spacingSuffixToPx("0.5")).toBe(2);
    expect(spacingSuffixToPx("1.5")).toBe(6);
    expect(spacingSuffixToPx("2.5")).toBe(10);
    expect(spacingSuffixToPx("3.5")).toBe(14);
  });

  it("decodes bracket values", () => {
    expect(spacingSuffixToPx("[13px]")).toBe(13);
    expect(spacingSuffixToPx("[-8px]")).toBe(-8);
  });

  it("returns null for sizing keywords", () => {
    expect(spacingSuffixToPx("auto")).toBeNull();
    expect(spacingSuffixToPx("full")).toBeNull();
    expect(spacingSuffixToPx("")).toBeNull();
  });
});

describe("pxToSpacingSuffix", () => {
  it("prefers scale for multiples of 4", () => {
    expect(pxToSpacingSuffix(0)).toBe("0");
    expect(pxToSpacingSuffix(4)).toBe("1");
    expect(pxToSpacingSuffix(16)).toBe("4");
    expect(pxToSpacingSuffix(64)).toBe("16");
  });

  it("maps irregular values to their scale keyword", () => {
    expect(pxToSpacingSuffix(1)).toBe("px");
    expect(pxToSpacingSuffix(2)).toBe("0.5");
    expect(pxToSpacingSuffix(6)).toBe("1.5");
    expect(pxToSpacingSuffix(14)).toBe("3.5");
  });

  it("brackets off-scale px", () => {
    expect(pxToSpacingSuffix(13)).toBe("[13px]");
    expect(pxToSpacingSuffix(5)).toBe("[5px]");
  });
});
