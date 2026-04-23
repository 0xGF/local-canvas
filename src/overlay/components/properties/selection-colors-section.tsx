import React, { useCallback, useEffect, useRef, useState } from "react";
import { Section } from "../ui/section.js";
import { ColorField } from "../ui/color-field.js";
import { CircleDot } from "../icons.js";
import { cn } from "../../lib/utils.js";
import { useSelectionColors, type ColorGroup } from "../../hooks/useSelectionColors.js";
import type { ClassHelpers, Sel } from "./shared.js";

const SELECTION_COLOR_DEBOUNCE_MS = 250;

function CountChip({ count }: { count: number }) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 px-2 h-7 rounded-md shrink-0",
        "bg-canvas-muted text-canvas-muted-fg text-[10px] font-mono tabular-nums",
      )}
      title={`${count} element${count === 1 ? "" : "s"}`}
    >
      <CircleDot size={10} />
      <span>{count}</span>
    </div>
  );
}

function buildReplacementClass(occ: ColorGroup["occurrences"][number], nextColor: string): string {
  return `${occ.variant}${occ.prefix}-[${nextColor.replace(/\s+/g, "")}]`;
}

export const SelectionColorsSection = React.memo(function SelectionColorsSection({ h, sel }: { h: ClassHelpers; sel: Sel }) {
  const groups = useSelectionColors(sel);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Clear a preview once the scan no longer contains its old color key —
  // that means the mutation landed and the group moved to a new key.
  useEffect(() => {
    setPreviews(prev => {
      let changed = false;
      const next: Record<string, string> = {};
      for (const key of Object.keys(prev)) {
        if (groups.some(g => g.key === key)) {
          next[key] = prev[key];
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [groups]);

  // Cancel any pending debounce on unmount.
  useEffect(() => () => {
    for (const t of Object.values(timersRef.current)) clearTimeout(t);
    timersRef.current = {};
  }, []);

  const apply = useCallback((group: ColorGroup, nextColor: string) => {
    setPreviews(p => ({ ...p, [group.key]: nextColor }));
    const existing = timersRef.current[group.key];
    if (existing) clearTimeout(existing);
    timersRef.current[group.key] = setTimeout(() => {
      delete timersRef.current[group.key];
      for (const occ of group.occurrences) {
        const add = buildReplacementClass(occ, nextColor);
        if (add === occ.fullClass) continue;
        h.trackedSendMutation({
          type: "modify-class",
          source: occ.source,
          remove: [occ.fullClass],
          add: [add],
        });
      }
    }, SELECTION_COLOR_DEBOUNCE_MS);
  }, [h]);

  if (groups.length === 0) return null;

  return (
    <Section title="Selection colors" defaultOpen={false}
      autoOpenKey={sel?.element} hasValue={groups.length > 0}>
      {groups.map(g => (
        <div key={g.key} className="grid grid-cols-[1fr_auto] gap-1.5 items-center">
          <ColorField
            value={previews[g.key] ?? g.colorCss}
            onChange={v => apply(g, v)}
            title={`Used on ${g.occurrences.length} element${g.occurrences.length === 1 ? "" : "s"}`}
          />
          <CountChip count={g.occurrences.length} />
        </div>
      ))}
    </Section>
  );
});
