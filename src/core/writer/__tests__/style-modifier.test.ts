import { describe, it, expect } from "vitest";
import { Project } from "ts-morph";
import { modifyStyle } from "../style-modifier.js";

/**
 * Each test builds an in-memory TSX source file, runs modifyStyle against a
 * target line, and asserts on the resulting source text. Covers the pattern
 * matrix in issue #18 — what we mutate, and what we refuse to touch.
 */
function run(
  source: string,
  line: number,
  property: string,
  value: string | undefined,
  opts: { column?: number } = {},
): { text: string; applied: boolean } {
  const project = new Project({ useInMemoryFileSystem: true });
  const sf = project.createSourceFile("test.tsx", source);
  const applied = modifyStyle(sf, line, opts.column, property, value);
  return { text: sf.getFullText(), applied };
}

// ---------------------------------------------------------------------------
// No style attribute — adds one
// ---------------------------------------------------------------------------
describe("no existing style attribute", () => {
  it("adds a style attribute with the property", () => {
    const r = run(`export const A = () => <div />;`, 1, "marginTop", "16px");
    expect(r.applied).toBe(true);
    expect(r.text).toContain(`style={{ marginTop: "16px" }}`);
  });

  it("removing a property on a styleless element is a no-op", () => {
    const src = `export const A = () => <div />;`;
    const r = run(src, 1, "marginTop", undefined);
    expect(r.applied).toBe(true);
    expect(r.text).toBe(src);
  });
});

// ---------------------------------------------------------------------------
// Object literal — add / remove / replace
// ---------------------------------------------------------------------------
describe("object literal style", () => {
  it("adds a new camelCase property", () => {
    const r = run(
      `export const A = () => <div style={{ marginTop: 16 }} />;`,
      1,
      "color",
      "#1c1917",
    );
    expect(r.applied).toBe(true);
    expect(r.text).toContain(`color: "#1c1917"`);
    expect(r.text).toContain(`marginTop: 16`);
  });

  it("replaces a numeric value with a numeric value (preserves form)", () => {
    const r = run(
      `export const A = () => <div style={{ marginTop: 16 }} />;`,
      1,
      "marginTop",
      "24",
    );
    expect(r.applied).toBe(true);
    expect(r.text).toContain(`marginTop: 24`);
    expect(r.text).not.toContain(`"24"`);
  });

  it("replaces a numeric value with a string when units are supplied", () => {
    const r = run(
      `export const A = () => <div style={{ marginTop: 16 }} />;`,
      1,
      "marginTop",
      "24px",
    );
    expect(r.applied).toBe(true);
    expect(r.text).toContain(`marginTop: "24px"`);
  });

  it("replaces a string value and preserves the string form", () => {
    const r = run(
      `export const A = () => <div style={{ marginTop: "1rem" }} />;`,
      1,
      "marginTop",
      "1.5rem",
    );
    expect(r.applied).toBe(true);
    expect(r.text).toContain(`marginTop: "1.5rem"`);
  });

  it("removes a property when value is undefined", () => {
    const r = run(
      `export const A = () => <div style={{ marginTop: 16, color: "red" }} />;`,
      1,
      "marginTop",
      undefined,
    );
    expect(r.applied).toBe(true);
    expect(r.text).not.toContain("marginTop");
    expect(r.text).toContain(`color: "red"`);
  });

  it("removing a non-existent property is a no-op", () => {
    const src = `export const A = () => <div style={{ color: "red" }} />;`;
    const r = run(src, 1, "marginTop", undefined);
    expect(r.applied).toBe(true);
    expect(r.text).toBe(src);
  });
});

// ---------------------------------------------------------------------------
// String / kebab-case / CSS variable keys
// ---------------------------------------------------------------------------
describe("string-key properties", () => {
  it("adds a kebab-case CSS variable key", () => {
    const r = run(
      `export const A = () => <div style={{ padding: 8 }} />;`,
      1,
      "--row-h",
      "42px",
    );
    expect(r.applied).toBe(true);
    expect(r.text).toContain(`"--row-h": "42px"`);
  });

  it("matches an existing CSS variable key written as a string literal", () => {
    const r = run(
      `export const A = () => <div style={{ "--row-h": "42px" }} />;`,
      1,
      "--row-h",
      "56px",
    );
    expect(r.applied).toBe(true);
    expect(r.text).toContain(`"--row-h": "56px"`);
  });

  it("matches a camelCase key defined as a string literal", () => {
    // Some codebases quote every key defensively — still the same property.
    const r = run(
      `export const A = () => <div style={{ "marginTop": 16 }} />;`,
      1,
      "marginTop",
      "24px",
    );
    expect(r.applied).toBe(true);
    expect(r.text).toContain(`"marginTop": "24px"`);
  });
});

// ---------------------------------------------------------------------------
// Spread base — leave the spread alone, mutate the literal portion
// ---------------------------------------------------------------------------
describe("spread base", () => {
  it("mutates only the object-literal portion, leaving spread untouched", () => {
    const r = run(
      `export const A = ({ base }) => <div style={{ ...base, marginTop: 16 }} />;`,
      1,
      "marginTop",
      "24px",
    );
    expect(r.applied).toBe(true);
    expect(r.text).toContain(`...base`);
    expect(r.text).toContain(`marginTop: "24px"`);
  });

  it("adds a new property next to a spread", () => {
    const r = run(
      `export const A = ({ base }) => <div style={{ ...base }} />;`,
      1,
      "color",
      "red",
    );
    expect(r.applied).toBe(true);
    expect(r.text).toContain(`...base`);
    expect(r.text).toContain(`color: "red"`);
  });
});

// ---------------------------------------------------------------------------
// Patterns we can't / won't mutate — caller sees `applied: false`
// ---------------------------------------------------------------------------
describe("unmutable patterns", () => {
  it("refuses to mutate a template-literal value", () => {
    // style={{ width: `calc(100% - ${gap}px)` }}
    const r = run(
      "export const A = ({ gap }) => <div style={{ width: `calc(100% - ${gap}px)` }} />;",
      1,
      "width",
      "320px",
    );
    expect(r.applied).toBe(false);
  });

  it("refuses to mutate a ternary value", () => {
    const r = run(
      `export const A = ({ on }) => <div style={{ color: on ? "red" : "blue" }} />;`,
      1,
      "color",
      "green",
    );
    expect(r.applied).toBe(false);
  });

  it("refuses to mutate an identifier value", () => {
    const r = run(
      `export const A = ({ theme }) => <div style={{ color: theme.primary }} />;`,
      1,
      "color",
      "green",
    );
    expect(r.applied).toBe(false);
  });

  it("refuses to mutate when style references an object variable", () => {
    const r = run(
      `export const A = ({ styles }) => <div style={styles} />;`,
      1,
      "color",
      "green",
    );
    expect(r.applied).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Shorthand (`{ color }`) — treat the target name as known, overwrite it
// ---------------------------------------------------------------------------
describe("shorthand property", () => {
  it("rewrites a shorthand assignment to a concrete value", () => {
    const r = run(
      `export const A = ({ color }) => <div style={{ color }} />;`,
      1,
      "color",
      "green",
    );
    expect(r.applied).toBe(true);
    expect(r.text).toContain(`color: "green"`);
    // The style object should no longer contain the shorthand form.
    expect(r.text).not.toMatch(/style=\{\{\s*color\s*\}\}/);
  });
});
