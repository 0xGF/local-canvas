import { describe, it, expect } from "vitest";
import { isOverlayElement, deepElementFromPoint } from "../element-picker.js";

describe("isOverlayElement", () => {
  it("returns true for element inside local-canvas-host", () => {
    const host = document.createElement("div");
    host.id = "local-canvas-host";
    const child = document.createElement("span");
    host.appendChild(child);
    document.body.appendChild(host);

    expect(isOverlayElement(child)).toBe(true);

    document.body.removeChild(host);
  });

  it("returns false for normal element", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    expect(isOverlayElement(el)).toBe(false);
    document.body.removeChild(el);
  });
});

describe("deepElementFromPoint", () => {
  it("skips HTML and BODY tags", () => {
    const mockDoc = {
      elementsFromPoint: (_x: number, _y: number) => [
        document.documentElement, // HTML
        document.body,            // BODY
      ],
    } as unknown as Document;

    expect(deepElementFromPoint(0, 0, mockDoc)).toBeNull();
  });

  it("skips elements with id 'root'", () => {
    const rootDiv = document.createElement("div");
    rootDiv.id = "root";
    const inner = document.createElement("p");

    const mockDoc = {
      elementsFromPoint: (_x: number, _y: number) => [rootDiv, inner],
    } as unknown as Document;

    // rootDiv is skipped because its id is "root", so inner is returned
    expect(deepElementFromPoint(0, 0, mockDoc)).toBe(inner);
  });
});
