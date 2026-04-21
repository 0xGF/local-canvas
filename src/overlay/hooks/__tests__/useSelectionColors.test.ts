import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { collectSelectionColors } from "../useSelectionColors.js";

function se(tag: string, cls: string, line: number, file = "App.tsx"): HTMLElement {
  const el = document.createElement(tag);
  el.className = cls;
  el.setAttribute("data-source-file", file);
  el.setAttribute("data-source-line", String(line));
  return el;
}

describe("collectSelectionColors", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("collects bracketed color classes across the subtree", () => {
    const root = se("div", "bg-[#fff]", 1);
    root.appendChild(se("span", "text-[#000]", 2));
    root.appendChild(se("span", "border-[#fff]", 3));
    document.body.appendChild(root);

    const groups = collectSelectionColors(root);
    expect(groups.length).toBe(2);

    const white = groups.find(g => g.hex === "FFFFFF")!;
    expect(white.occurrences.length).toBe(2);
    const black = groups.find(g => g.hex === "000000")!;
    expect(black.occurrences.length).toBe(1);
  });

  it("normalizes equivalent color syntaxes into a single group", () => {
    const root = se("div", "bg-[#ffffff]", 1);
    root.appendChild(se("span", "text-[rgb(255,255,255)]", 2));
    document.body.appendChild(root);

    const groups = collectSelectionColors(root);
    expect(groups.length).toBe(1);
    expect(groups[0].occurrences.length).toBe(2);
  });

  it("groups by alpha — same hex with different alpha are separate rows", () => {
    const root = se("div", "bg-[#000000]", 1);
    root.appendChild(se("span", "text-[rgba(0,0,0,0.2)]", 2));
    document.body.appendChild(root);

    const groups = collectSelectionColors(root);
    expect(groups.length).toBe(2);
    const full = groups.find(g => Math.round(g.alpha * 100) === 100)!;
    const fifth = groups.find(g => Math.round(g.alpha * 100) === 20)!;
    expect(full).toBeTruthy();
    expect(fifth).toBeTruthy();
  });

  it("preserves variant prefixes on occurrences", () => {
    const root = se("div", "md:hover:bg-[#abc]", 1);
    document.body.appendChild(root);

    const [group] = collectSelectionColors(root);
    expect(group.occurrences[0].variant).toBe("md:hover:");
    expect(group.occurrences[0].prefix).toBe("bg");
  });

  it("ignores non-color bracket values (widths, positions)", () => {
    const root = se("div", "w-[100px] h-[50%] bg-[#abc]", 1);
    document.body.appendChild(root);

    const groups = collectSelectionColors(root);
    expect(groups.length).toBe(1);
    expect(groups[0].hex).toBe("AABBCC");
  });

  it("skips elements without a source-map (can't be mutated)", () => {
    const root = se("div", "", 1);
    const plain = document.createElement("div");
    plain.className = "bg-[#ff0000]";
    root.appendChild(plain);
    document.body.appendChild(root);

    expect(collectSelectionColors(root).length).toBe(0);
  });

  it("sorts rows by count desc, then hex", () => {
    const root = se("div", "bg-[#aaaaaa]", 1);
    root.appendChild(se("span", "text-[#111111]", 2));
    root.appendChild(se("span", "border-[#111111]", 3));
    document.body.appendChild(root);

    const groups = collectSelectionColors(root);
    expect(groups.map(g => g.hex)).toEqual(["111111", "AAAAAA"]);
  });
});
