import * as React from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import { cn } from "../../lib/utils.js";
import { usePortalContainer } from "../../lib/portal-container.js";

/**
 * Thin wrapper around Radix Tooltip tuned for the properties panel:
 *
 *  - 120ms show delay — fast enough to feel instant, slow enough to not
 *    flash on casual mouse-over. Radix's default is 700ms which is way too
 *    slow for the dense field grid.
 *  - Portals into the shadow-DOM mount point so Tailwind utilities resolve
 *    (document.body is outside our stylesheet scope).
 *  - Styled with canvas-* tokens to match the rest of the chrome.
 *
 * Pass `content` as a string or ReactNode. Use `shortcut` to render a
 * right-aligned key hint (e.g. `⌘K`) in the muted-fg color.
 */

interface TooltipProps {
  content: React.ReactNode;
  shortcut?: string;
  children: React.ReactElement;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  /** Override global delay (ms). */
  delayDuration?: number;
  /** If omitted, wraps children unconditionally. Pass false to bypass. */
  disabled?: boolean;
}

export function Tooltip({
  content,
  shortcut,
  children,
  side = "top",
  align = "center",
  delayDuration = 120,
  disabled,
}: TooltipProps) {
  const portalContainer = usePortalContainer();
  if (disabled || content == null || content === "") return children;
  // Self-provide so individual fields work without a root TooltipProvider
  // (tests mount primitives in isolation). A root Provider still wraps the
  // overlay app for the skip-delay window between neighboring tooltips —
  // nested Providers are allowed and just scope their own delay config.
  return (
    <RadixTooltip.Provider delayDuration={delayDuration} skipDelayDuration={300}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal container={portalContainer}>
          <RadixTooltip.Content
            side={side}
            align={align}
            sideOffset={6}
            collisionPadding={8}
            className={cn(
              "z-[2147483647] select-none rounded-md",
              "bg-canvas-bg border border-canvas-border shadow-md",
              "px-2 py-1 text-[10px] leading-none text-canvas-fg font-medium",
              "whitespace-nowrap",
              "data-[state=delayed-open]:animate-tooltip-in",
              "data-[state=closed]:animate-tooltip-out",
            )}
          >
            <span>{content}</span>
            {shortcut && (
              <span className="ml-2 text-canvas-muted-fg font-mono text-[9px]">
                {shortcut}
              </span>
            )}
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}

/**
 * Root provider — wrap the app so mousing between neighboring fields shows
 * the next tooltip instantly (Figma/Framer feel). Tooltip also self-provides
 * so it works standalone in tests.
 */
export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={120} skipDelayDuration={300}>
      {children}
    </RadixTooltip.Provider>
  );
}
