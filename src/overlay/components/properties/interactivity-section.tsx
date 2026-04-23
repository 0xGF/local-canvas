import React, { useCallback } from "react";
import { Section } from "../ui/section.js";
import { SelectField } from "../ui/select-field.js";
import type { ClassHelpers, Sel } from "./shared.js";

const CURSOR_SELECT = [
  { value: "",            label: "Auto" },
  { value: "default",     label: "Default" },
  { value: "pointer",     label: "Pointer" },
  { value: "wait",        label: "Wait" },
  { value: "text",        label: "Text" },
  { value: "move",        label: "Move" },
  { value: "help",        label: "Help" },
  { value: "not-allowed", label: "Not allowed" },
  { value: "none",        label: "None" },
  { value: "grab",        label: "Grab" },
  { value: "grabbing",    label: "Grabbing" },
  { value: "crosshair",   label: "Crosshair" },
  { value: "zoom-in",     label: "Zoom in" },
  { value: "zoom-out",    label: "Zoom out" },
];

const POINTER_SELECT = [
  { value: "",     label: "Auto" },
  { value: "auto", label: "Auto" },
  { value: "none", label: "None" },
];

const USER_SELECT_SELECT = [
  { value: "",     label: "Auto" },
  { value: "auto", label: "Auto" },
  { value: "none", label: "None" },
  { value: "text", label: "Text" },
  { value: "all",  label: "All" },
];

export const InteractivitySection = React.memo(function InteractivitySection({ h, sel }: { h: ClassHelpers; sel: Sel }) {
  const cursorCls = h.classes.find(c => /^cursor-/.test(h.stripBpPrefix(c)));
  const cursorVal = cursorCls ? h.stripBpPrefix(cursorCls).slice("cursor-".length) : "";
  const setCursor = useCallback((v: string) => {
    if (!sel?.source) return;
    const remove = h.classes.filter(c => /^cursor-/.test(h.stripBpPrefix(c)));
    h.sendPrefixed({
      type: "modify-class", source: sel.source,
      remove: remove.length ? remove : undefined,
      add: v ? [`cursor-${v}`] : undefined,
    });
  }, [h, sel]);

  const pointerCls = h.classes.find(c => /^pointer-events-/.test(h.stripBpPrefix(c)));
  const pointerVal = pointerCls ? h.stripBpPrefix(pointerCls).slice("pointer-events-".length) : "";
  const setPointer = useCallback((v: string) => {
    if (!sel?.source) return;
    const remove = h.classes.filter(c => /^pointer-events-/.test(h.stripBpPrefix(c)));
    h.sendPrefixed({
      type: "modify-class", source: sel.source,
      remove: remove.length ? remove : undefined,
      add: v ? [`pointer-events-${v}`] : undefined,
    });
  }, [h, sel]);

  const selectCls = h.classes.find(c => /^select-/.test(h.stripBpPrefix(c)));
  const selectVal = selectCls ? h.stripBpPrefix(selectCls).slice("select-".length) : "";
  const setSelect = useCallback((v: string) => {
    if (!sel?.source) return;
    const remove = h.classes.filter(c => /^select-/.test(h.stripBpPrefix(c)));
    h.sendPrefixed({
      type: "modify-class", source: sel.source,
      remove: remove.length ? remove : undefined,
      add: v ? [`select-${v}`] : undefined,
    });
  }, [h, sel]);

  const hasInteractivity = !!(cursorCls || pointerCls || selectCls);

  return (
    <Section title="Interactivity" defaultOpen={false}
      autoOpenKey={sel?.element} hasValue={hasInteractivity}>
      <div className="grid grid-cols-[auto_1fr] gap-1.5 items-center">
        <span className="text-[10px] text-canvas-muted-fg w-11 shrink-0">Cursor</span>
        <SelectField
          value={cursorVal}
          options={CURSOR_SELECT}
          onChange={setCursor}
          placeholder="Auto"
          title="Cursor"
        />
        <span className="text-[10px] text-canvas-muted-fg w-11 shrink-0">Pointer</span>
        <SelectField
          value={pointerVal}
          options={POINTER_SELECT}
          onChange={setPointer}
          placeholder="Auto"
          title="Pointer events"
        />
        <span className="text-[10px] text-canvas-muted-fg w-11 shrink-0">Select</span>
        <SelectField
          value={selectVal}
          options={USER_SELECT_SELECT}
          onChange={setSelect}
          placeholder="Auto"
          title="User select"
        />
      </div>
    </Section>
  );
});
