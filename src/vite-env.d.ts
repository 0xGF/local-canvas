/// <reference types="vite/client" />

declare module "*.css?inline" {
  const css: string;
  export default css;
}

// Per-icon subpath imports from @hugeicons/core-free-icons. The package ships
// only an index.d.ts, so TS can't resolve types for subpath imports even
// though the ESM files exist. We import each icon individually (instead of
// via the barrel) to let Rollup tree-shake — the barrel is a single
// pre-minified blob that pulls every icon. Icons are opaque arrays passed to
// `<HugeiconsIcon icon={...} />`.
declare module "@hugeicons/core-free-icons/*" {
  const icon: unknown;
  export default icon;
}

// Custom DOM events dispatched by the overlay — declared so addEventListener
// / removeEventListener calls are typed without `as any`.
interface DocumentEventMap {
  "canvas:start-text-edit": Event;
}
