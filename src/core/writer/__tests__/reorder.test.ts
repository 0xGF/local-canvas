import { describe, it, expect } from "vitest";
import { Project } from "ts-morph";
import { reorderChildren } from "../reorder.js";

function mk(source: string) {
  const project = new Project({ useInMemoryFileSystem: true });
  return project.createSourceFile("test.tsx", source);
}

describe("reorderChildren — move semantics (not swap)", () => {
  // Parent opens on line 2 across these fixtures.
  const BASE = `export const X = () => (
  <ul>
    <li>A</li>
    <li>B</li>
    <li>C</li>
    <li>D</li>
    <li>E</li>
  </ul>
);`;

  it("moves an element down past adjacent sibling", () => {
    const sf = mk(BASE);
    // Move A (index 0) to sit between B and C → toIndex=1 (post-removal list [B,C,D,E])
    reorderChildren(sf, 2, 0, 1);
    const text = sf.getFullText();
    // Order should be B, A, C, D, E
    expect(text.indexOf("<li>B</li>")).toBeLessThan(text.indexOf("<li>A</li>"));
    expect(text.indexOf("<li>A</li>")).toBeLessThan(text.indexOf("<li>C</li>"));
    expect(text.indexOf("<li>C</li>")).toBeLessThan(text.indexOf("<li>D</li>"));
    expect(text.indexOf("<li>D</li>")).toBeLessThan(text.indexOf("<li>E</li>"));
  });

  it("moves an element up across several siblings (this was the bug)", () => {
    const sf = mk(BASE);
    // Move D (fromIndex=3) to between A and B. Post-removal list is [A,B,C,E]
    // so toIndex=1 means "insert before B".
    reorderChildren(sf, 2, 3, 1);
    const text = sf.getFullText();
    // Expected order: A, D, B, C, E
    // Old buggy swap would have produced: A, D, C, B, E (swap B and D).
    const ia = text.indexOf("<li>A</li>");
    const id = text.indexOf("<li>D</li>");
    const ib = text.indexOf("<li>B</li>");
    const ic = text.indexOf("<li>C</li>");
    const ie = text.indexOf("<li>E</li>");
    expect(ia).toBeLessThan(id);
    expect(id).toBeLessThan(ib);
    expect(ib).toBeLessThan(ic);
    expect(ic).toBeLessThan(ie);
  });

  it("moves an element to the end", () => {
    const sf = mk(BASE);
    // Move B (fromIndex=1) to end. Post-removal list [A,C,D,E] length 4.
    // Client sends toIndex = remaining.length = 4 as the "append" sentinel.
    reorderChildren(sf, 2, 1, 4);
    const text = sf.getFullText();
    // Expected: A, C, D, E, B
    const ia = text.indexOf("<li>A</li>");
    const ic = text.indexOf("<li>C</li>");
    const id = text.indexOf("<li>D</li>");
    const ie = text.indexOf("<li>E</li>");
    const ib = text.indexOf("<li>B</li>");
    expect(ia).toBeLessThan(ic);
    expect(ic).toBeLessThan(id);
    expect(id).toBeLessThan(ie);
    expect(ie).toBeLessThan(ib);
  });

  it("no-op when fromIndex === toIndex", () => {
    const sf = mk(BASE);
    const before = sf.getFullText();
    reorderChildren(sf, 2, 2, 2);
    expect(sf.getFullText()).toBe(before);
  });
});
