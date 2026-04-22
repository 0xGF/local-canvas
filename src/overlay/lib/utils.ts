import { type ClassValue, clsx } from "clsx";

// Previously `twMerge(clsx(inputs))`. tailwind-merge is 70KB minified and
// resolves conflicting utility classes (e.g. `p-4` + `p-2` → `p-2`). For the
// overlay that cost isn't worth it: call sites either append additive classes
// or branch conditionally on exclusive pairs, and users of these primitives
// pass extension classes, not overrides. If an override is ever needed, have
// the caller remove the conflicting base class first.
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
