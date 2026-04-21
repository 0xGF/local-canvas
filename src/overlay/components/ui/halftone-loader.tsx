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
}: {
  className?: string;
  rounded?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={["halftone-loader", rounded, className].join(" ")}
    />
  );
}
