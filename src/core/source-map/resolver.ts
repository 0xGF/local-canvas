import type { SourceLocation } from "./types.js";

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

interface ReactFiber {
  _debugSource?: { fileName: string; lineNumber: number; columnNumber?: number };
  return?: ReactFiber;
}

function resolveFromFiber(element: HTMLElement): SourceLocation | null {
  // Access React's internal fiber node for _debugSource. The key is hashed
  // (`__reactFiber$abc123`) so we can't statically declare the property.
  const fiberKey = Object.keys(element).find((key) =>
    key.startsWith("__reactFiber$")
  );

  if (!fiberKey) return null;

  let fiber: ReactFiber | undefined = (element as unknown as Record<string, ReactFiber>)[fiberKey];

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

