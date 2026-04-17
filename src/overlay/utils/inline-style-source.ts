/**
 * Does the element's `style=""` attribute actually declare this property in
 * source? Reads the raw attribute rather than the CSSOM so we aren't fooled
 * by inline previews the drag/resize handlers have written to `el.style`.
 * Handles shorthand roots too — `margin: 16px` in source matches a query for
 * `margin-top`, because setting the shorthand propagates to the subproperty.
 */
export function sourceStyleHasProperty(el: HTMLElement, cssProp: string): boolean {
  const raw = el.getAttribute("style") || "";
  if (!raw) return false;
  const direct = new RegExp(`(?:^|;)\\s*${cssProp}\\s*:`, "i");
  if (direct.test(raw)) return true;
  const shortMatch = cssProp.match(/^(margin|padding|border)-/);
  if (shortMatch) {
    const short = shortMatch[1];
    if (new RegExp(`(?:^|;)\\s*${short}\\s*:`, "i").test(raw)) return true;
  }
  return false;
}

export function camelToKebabCss(s: string): string {
  return s.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
}
