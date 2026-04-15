/// <reference types="vite/client" />

declare module "*.css?inline" {
  const css: string;
  export default css;
}

// Custom DOM events dispatched by the overlay — declared so addEventListener
// / removeEventListener calls are typed without `as any`.
interface DocumentEventMap {
  "canvas:start-text-edit": Event;
}
