import type { SourceLocation, MappedElement } from "./types.js";

export function resolveSource(element: HTMLElement): SourceLocation | null {
  let current: HTMLElement | null = element;

  while (current) {
    const file = current.dataset.sourceFile;
    const line = current.dataset.sourceLine;

    if (file && line) {
      return {
        filePath: file,
        line: parseInt(line, 10),
        column: current.dataset.sourceCol
          ? parseInt(current.dataset.sourceCol, 10)
          : undefined,
      };
    }

    current = current.parentElement;
  }

  // Fallback: try React DevTools fiber
  return resolveFromFiber(element);
}

export function resolveElement(element: HTMLElement): MappedElement | null {
  const source = resolveSource(element);
  if (!source) return null;

  return {
    domElement: element,
    source,
    tagName: element.tagName.toLowerCase(),
    className: element.className || "",
    isComponent: false, // Will be determined by the tag name in source
  };
}

function resolveFromFiber(element: HTMLElement): SourceLocation | null {
  // Access React's internal fiber node for _debugSource
  const fiberKey = Object.keys(element).find((key) =>
    key.startsWith("__reactFiber$")
  );

  if (!fiberKey) return null;

  let fiber = (element as any)[fiberKey];

  while (fiber) {
    if (fiber._debugSource) {
      const source = fiber._debugSource;
      return {
        filePath: source.fileName,
        line: source.lineNumber,
        column: source.columnNumber,
      };
    }
    fiber = fiber.return;
  }

  return null;
}

export function getElementPath(element: HTMLElement, maxDepth = 5): string {
  const parts: string[] = [];
  let current: HTMLElement | null = element;
  let depth = 0;

  while (current && depth < maxDepth) {
    let part = current.tagName.toLowerCase();

    if (current.id) {
      part += `#${current.id}`;
    } else if (current.className && typeof current.className === "string") {
      const firstClass = current.className.split(/\s+/)[0];
      if (firstClass) {
        part += `.${firstClass}`;
      }
    }

    parts.unshift(part);
    current = current.parentElement;
    depth++;
  }

  return parts.join(" > ");
}
