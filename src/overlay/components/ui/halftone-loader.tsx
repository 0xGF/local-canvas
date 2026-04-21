import React from "react";

/**
 * Shared halftone-shimmer loader. The visual (dot grid + shimmer mask) lives
 * in `.halftone-loader` in styles.css — Tailwind's arbitrary values on
 * pseudo-element masks don't compile reliably, so one CSS class is the
 * path of least resistance. Tailwind utilities wrap positioning and
 * corner-radius around it.
 */
export function HalftoneLoader({
  className = "",
  rounded = "rounded-lg",
  wiping = false,
}: {
  className?: string;
  rounded?: string;
  /** Trigger the top-to-bottom mask-wipe reveal. */
  wiping?: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className={[
        "halftone-loader",
        wiping ? "wiping" : "",
        rounded,
        className,
      ].join(" ")}
    />
  );
}
