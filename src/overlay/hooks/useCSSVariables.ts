import { useState, useEffect, useMemo } from "react";

interface CSSVariable {
  name: string;
  value: string;
}

/**
 * Scan the page's stylesheets and computed styles for CSS custom properties.
 * Returns a list of available variables with their current computed values.
 * Re-scans when the selected element changes.
 */
export function useCSSVariables(element: HTMLElement | null | undefined): CSSVariable[] {
  const [variables, setVariables] = useState<CSSVariable[]>([]);

  useEffect(() => {
    if (!element) {
      setVariables([]);
      return;
    }

    const vars = new Map<string, string>();

    // 1. Scan document.styleSheets for --* declarations
    try {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule instanceof CSSStyleRule) {
              for (let i = 0; i < rule.style.length; i++) {
                const prop = rule.style[i];
                if (prop.startsWith("--")) {
                  vars.set(prop, rule.style.getPropertyValue(prop).trim());
                }
              }
            }
          }
        } catch {
          // Cross-origin sheets throw SecurityError — skip silently
        }
      }
    } catch {
      // Ignore stylesheet access errors
    }

    // 2. Scan :root / documentElement computed styles for --* properties
    const rootStyle = getComputedStyle(document.documentElement);
    for (let i = 0; i < rootStyle.length; i++) {
      const prop = rootStyle[i];
      if (prop.startsWith("--")) {
        vars.set(prop, rootStyle.getPropertyValue(prop).trim());
      }
    }

    // 3. Scan the element's own computed styles
    const elStyle = getComputedStyle(element);
    for (let i = 0; i < elStyle.length; i++) {
      const prop = elStyle[i];
      if (prop.startsWith("--")) {
        vars.set(prop, elStyle.getPropertyValue(prop).trim());
      }
    }

    // Convert to sorted array
    const result: CSSVariable[] = [];
    for (const [name, value] of vars) {
      result.push({ name, value });
    }
    result.sort((a, b) => a.name.localeCompare(b.name));

    setVariables(result);
  }, [element]);

  return variables;
}

/**
 * Filter CSS variables by a search prefix.
 */
export function filterVariables(variables: CSSVariable[], query: string): CSSVariable[] {
  if (!query) return variables;
  const lower = query.toLowerCase();
  return variables.filter(v => v.name.toLowerCase().includes(lower));
}
