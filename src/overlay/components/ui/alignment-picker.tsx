import React from "react";

// 3x3 flex alignment picker. Matches the Figma/Framer pattern:
// - Columns/rows correspond to the cross vs main axis, depending on flex-direction.
// - Active cell shows three bars oriented along the current main axis.
//
// Mapping (flex-direction = row):
//   cell (x, y) => justify-content = x, align-items = y
// Mapping (flex-direction = col):
//   cell (x, y) => align-items = x, justify-content = y
//
// Only `start | center | end` are representable here. Callers still expose
// `between/around/evenly/stretch/baseline` through an advanced selector.

type Axis = "start" | "center" | "end";
const AXES: Axis[] = ["start", "center", "end"];

interface Props {
  direction: "row" | "col";
  justify: string; // bare value e.g. "center" or "" (unset)
  align: string;   // bare value e.g. "center" or "" (unset)
  onChange: (justify: string, align: string) => void;
}

const isAxis = (v: string): v is Axis => v === "start" || v === "center" || v === "end";

export const AlignmentPicker = React.memo(function AlignmentPicker({
  direction, justify, align, onChange,
}: Props) {
  const isRow = direction === "row";
  // Unset values collapse to "start" visually (matches browser default for
  // justify-content; we intentionally also show align-items default as start
  // even though the real CSS default is stretch — highlighting *something*
  // is clearer than a blank picker).
  const resolvedJustify = isAxis(justify) ? justify : (justify === "" ? "start" : "");
  const resolvedAlign = isAxis(align) ? align : (align === "" ? "start" : "");
  const activeX = isRow ? resolvedJustify : resolvedAlign;
  const activeY = isRow ? resolvedAlign : resolvedJustify;

  return (
    <div
      role="group"
      aria-label="Flex alignment"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gridTemplateRows: "1fr 1fr 1fr",
        width: "100%",
        aspectRatio: "1.75 / 1",
        background: "rgba(255,255,255,0.035)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      {AXES.map(y =>
        AXES.map(x => (
          <Cell
            key={`${x}-${y}`}
            x={x}
            y={y}
            active={x === activeX && y === activeY}
            direction={direction}
            onClick={() => {
              const nextJustify = isRow ? x : y;
              const nextAlign = isRow ? y : x;
              onChange(nextJustify, nextAlign);
            }}
          />
        )),
      )}
    </div>
  );
});

const Cell = React.memo(function Cell({
  x, y, active, direction, onClick,
}: { x: Axis; y: Axis; active: boolean; direction: "row" | "col"; onClick: () => void }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={`Align ${x} ${y}`}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        all: "unset",
        boxSizing: "border-box",
        cursor: "pointer",
        display: "flex",
        alignItems: y === "start" ? "flex-start" : y === "end" ? "flex-end" : "center",
        justifyContent: x === "start" ? "flex-start" : x === "end" ? "flex-end" : "center",
        padding: 4,
        background: active
          ? "transparent"
          : hover ? "rgba(255,255,255,0.05)" : "transparent",
        color: active ? "#7cb7ff" : "rgba(255,255,255,0.32)",
        transition: "background 80ms linear",
      }}
    >
      {active || hover ? <Bars direction={direction} /> : <Dot />}
    </button>
  );
});

const Dot = () => (
  <span
    aria-hidden
    style={{
      width: 3, height: 3, borderRadius: "50%",
      background: "currentColor",
    }}
  />
);

const Bars = ({ direction }: { direction: "row" | "col" }) => {
  // Main-axis = horizontal for row → bars are vertical (columns of bars).
  // Main-axis = vertical for col → bars are horizontal (stacked rows).
  const vertical = direction === "row";
  const base: React.CSSProperties = {
    background: "currentColor",
    borderRadius: 1,
    display: "block",
  };
  return (
    <div
      aria-hidden
      style={{
        display: "flex",
        gap: 2,
        flexDirection: vertical ? "row" : "column",
      }}
    >
      <span style={{ ...base, width: vertical ? 2 : 7, height: vertical ? 7 : 2 }} />
      <span style={{ ...base, width: vertical ? 2 : 10, height: vertical ? 10 : 2 }} />
      <span style={{ ...base, width: vertical ? 2 : 7, height: vertical ? 7 : 2 }} />
    </div>
  );
};
