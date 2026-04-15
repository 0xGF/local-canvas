/**
 * Typed helper for setting arbitrary CSS properties on an element.
 *
 * TypeScript's `CSSStyleDeclaration` is an indexed type but insists on
 * compile-time-known keys, so dynamic camelCase assignment forces a cast.
 * Centralize the cast here instead of sprinkling `(el.style as any)[prop]`
 * across the codebase.
 */
export function setStyleProp(el: HTMLElement, prop: string, value: string): void {
  (el.style as unknown as Record<string, string>)[prop] = value;
}
