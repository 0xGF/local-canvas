import { describe, it, expect } from "vitest";
import {
  LENGTH,
  INTEGER,
  GRID_COLS,
  KEYWORD,
  RAW,
  ANGLE,
  DURATION,
  NUMBER,
  _internal,
  type Preset,
} from "../value-input.parsers.js";

// Mirror of the preset sets used by the panel.
const SIZE_PRESETS: Preset[] = [
  { value: "", label: "Auto" },
  { value: "full", label: "100%" },
  { value: "screen", label: "100vh" },
  { value: "min", label: "min-content" },
  { value: "max", label: "max-content" },
  { value: "fit", label: "fit-content" },
  { value: "1/2", label: "50%" },
  { value: "1/3", label: "33.33%" },
];

const INSET_PRESETS: Preset[] = [
  { value: "", label: "Auto" },
  { value: "0", label: "0" },
  { value: "px", label: "1px" },
  { value: "1", label: "4px" },
  { value: "4", label: "16px" },
  { value: "1/2", label: "50%" },
  { value: "full", label: "100%" },
];

const Z_PRESETS: Preset[] = [
  { value: "", label: "Auto" },
  { value: "0", label: "0" },
  { value: "10", label: "10" },
  { value: "50", label: "50" },
];

const GRID_PRESETS: Preset[] = [
  { value: "", label: "None" },
  { value: "1", label: "1" },
  { value: "3", label: "3" },
  { value: "12", label: "12" },
];

const SHADOW_PRESETS: Preset[] = [
  { value: "none", label: "none" },
  { value: "md", label: "md" },
  { value: "xl", label: "xl" },
  { value: "inner", label: "inner" },
];

const LEADING_PRESETS: Preset[] = [
  { value: "", label: "Normal" },
  { value: "tight", label: "1.25" },
  { value: "relaxed", label: "1.625" },
];

const FONT_WEIGHT_PRESETS: Preset[] = [
  { value: "thin", label: "100" },
  { value: "normal", label: "400" },
  { value: "bold", label: "700" },
];

const FONT_SIZE_PRESETS: Preset[] = [
  { value: "xs", label: "12px" },
  { value: "base", label: "16px" },
  { value: "xl", label: "20px" },
];

// ══════════════════════════════════════════════════════════════════════════
// helpers
// ══════════════════════════════════════════════════════════════════════════

describe("_internal.toBracket / unbracket", () => {
  it("underscores spaces when bracketing", () => {
    expect(_internal.toBracket("0 4px 12px")).toBe("[0_4px_12px]");
  });
  it("restores spaces from bracket", () => {
    expect(_internal.unbracket("[0_4px_12px]")).toBe("0 4px 12px");
  });
  it("passes bare values through unbracket", () => {
    expect(_internal.unbracket("full")).toBe("full");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// LENGTH strategy — padding/margin/top/W/H/font-size/radius
// ══════════════════════════════════════════════════════════════════════════

describe("LENGTH.parse", () => {
  it("clears empty input", () => {
    expect(LENGTH.parse("", SIZE_PRESETS)).toBe("");
    expect(LENGTH.parse("   ", SIZE_PRESETS)).toBe("");
  });
  it("matches preset by value", () => {
    expect(LENGTH.parse("full", SIZE_PRESETS)).toBe("full");
    expect(LENGTH.parse("fit", SIZE_PRESETS)).toBe("fit");
  });
  it("matches preset by label (case-insensitive)", () => {
    expect(LENGTH.parse("100%", SIZE_PRESETS)).toBe("full");
    expect(LENGTH.parse("50%", SIZE_PRESETS)).toBe("1/2");
    expect(LENGTH.parse("Min-Content", SIZE_PRESETS)).toBe("min");
  });
  it("matches preset label for inset ('16px' → '4')", () => {
    expect(LENGTH.parse("16px", INSET_PRESETS)).toBe("4");
    expect(LENGTH.parse("1px", INSET_PRESETS)).toBe("px");
  });
  it("bare number becomes [Npx]", () => {
    expect(LENGTH.parse("27", [])).toBe("[27px]");
    expect(LENGTH.parse("0", [])).toBe("[0px]");
    expect(LENGTH.parse("2.5", [])).toBe("[2.5px]");
  });
  it("negative bare number → [-Npx]", () => {
    expect(LENGTH.parse("-12", [])).toBe("[-12px]");
  });
  it("number with unit → [Nunit]", () => {
    expect(LENGTH.parse("1.5rem", [])).toBe("[1.5rem]");
    expect(LENGTH.parse("50%", [])).toBe("[50%]");
    expect(LENGTH.parse("100vw", [])).toBe("[100vw]");
    expect(LENGTH.parse("10em", [])).toBe("[10em]");
    expect(LENGTH.parse("1lh", [])).toBe("[1lh]");
    expect(LENGTH.parse("2svh", [])).toBe("[2svh]");
  });
  it("negative with unit → [-Nunit]", () => {
    expect(LENGTH.parse("-12px", [])).toBe("[-12px]");
    expect(LENGTH.parse("-0.5rem", [])).toBe("[-0.5rem]");
  });
  it("already-bracketed value passes through", () => {
    expect(LENGTH.parse("[27px]", [])).toBe("[27px]");
    expect(LENGTH.parse("[calc(100%-20px)]", [])).toBe("[calc(100%-20px)]");
  });
  it("calc/var expressions get bracketed with space→underscore", () => {
    expect(LENGTH.parse("calc(100% - 20px)", [])).toBe("[calc(100%_-_20px)]");
    expect(LENGTH.parse("var(--sidebar-w)", [])).toBe("[var(--sidebar-w)]");
    expect(LENGTH.parse("min(100%, 600px)", [])).toBe("[min(100%,_600px)]");
  });
  it("unknown unit gets bracketed verbatim", () => {
    expect(LENGTH.parse("1fr", [])).toBe("[1fr]");
  });
});

describe("LENGTH.format", () => {
  it("empty stays empty", () => {
    expect(LENGTH.format("", SIZE_PRESETS)).toBe("");
  });
  it("preset value renders its label", () => {
    expect(LENGTH.format("full", SIZE_PRESETS)).toBe("100%");
    expect(LENGTH.format("1/2", SIZE_PRESETS)).toBe("50%");
  });
  it("preset with no label falls back to value", () => {
    expect(LENGTH.format("md", [{ value: "md" }])).toBe("md");
  });
  it("unbrackets arbitrary values", () => {
    expect(LENGTH.format("[27px]", [])).toBe("27px");
    expect(LENGTH.format("[1.5rem]", [])).toBe("1.5rem");
  });
  it("unbracket restores spaces", () => {
    expect(LENGTH.format("[calc(100%_-_20px)]", [])).toBe("calc(100% - 20px)");
  });
  it("bare Tailwind scale without preset label shows the raw token", () => {
    // E.g. "4" with no preset → "4"
    expect(LENGTH.format("4", [])).toBe("4");
  });
});

describe("LENGTH round-trip", () => {
  it("preset value survives a round-trip", () => {
    const v = LENGTH.parse(LENGTH.format("1/2", INSET_PRESETS), INSET_PRESETS);
    expect(v).toBe("1/2");
  });
  it("bracket value survives a round-trip", () => {
    const v = LENGTH.parse(LENGTH.format("[27px]", []), []);
    expect(v).toBe("[27px]");
  });
  it("bracket with unit survives a round-trip", () => {
    const v = LENGTH.parse(LENGTH.format("[1.5rem]", []), []);
    expect(v).toBe("[1.5rem]");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// INTEGER strategy — z-index, outline, order
// ══════════════════════════════════════════════════════════════════════════

describe("INTEGER.parse", () => {
  it("clears empty", () => {
    expect(INTEGER.parse("", Z_PRESETS)).toBe("");
  });
  it("matches preset", () => {
    expect(INTEGER.parse("10", Z_PRESETS)).toBe("10");
    expect(INTEGER.parse("auto", Z_PRESETS)).toBe("");
  });
  it("unknown integer becomes [N]", () => {
    expect(INTEGER.parse("5", Z_PRESETS)).toBe("[5]");
    expect(INTEGER.parse("999", Z_PRESETS)).toBe("[999]");
  });
  it("negative integer supported", () => {
    expect(INTEGER.parse("-1", Z_PRESETS)).toBe("[-1]");
  });
  it("already-bracketed passes through", () => {
    expect(INTEGER.parse("[42]", [])).toBe("[42]");
  });
});

describe("INTEGER.format", () => {
  it("preset → label", () => {
    expect(INTEGER.format("10", Z_PRESETS)).toBe("10");
    expect(INTEGER.format("", Z_PRESETS)).toBe("");
  });
  it("bracket → inner", () => {
    expect(INTEGER.format("[999]", [])).toBe("999");
    expect(INTEGER.format("[-1]", [])).toBe("-1");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// GRID_COLS strategy
// ══════════════════════════════════════════════════════════════════════════

describe("GRID_COLS.parse", () => {
  it("1-12 stays bare", () => {
    expect(GRID_COLS.parse("3", GRID_PRESETS)).toBe("3");
    expect(GRID_COLS.parse("7", GRID_PRESETS)).toBe("7");
    expect(GRID_COLS.parse("12", GRID_PRESETS)).toBe("12");
  });
  it(">12 becomes bracket repeat()", () => {
    expect(GRID_COLS.parse("15", GRID_PRESETS)).toBe("[repeat(15,minmax(0,1fr))]");
  });
  it("arbitrary grid template", () => {
    expect(GRID_COLS.parse("200px 1fr", GRID_PRESETS)).toBe("[200px_1fr]");
  });
  it("preset labels still match", () => {
    expect(GRID_COLS.parse("None", GRID_PRESETS)).toBe("");
  });
});

describe("GRID_COLS.format", () => {
  it("bare ints render bare", () => {
    expect(GRID_COLS.format("3", GRID_PRESETS)).toBe("3");
  });
  it("bracket → inner with spaces", () => {
    expect(GRID_COLS.format("[200px_1fr]", [])).toBe("200px 1fr");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// KEYWORD strategy — shadow, leading, tracking, font-weight, flex
// ══════════════════════════════════════════════════════════════════════════

describe("KEYWORD.parse", () => {
  it("preset matches by value", () => {
    expect(KEYWORD.parse("md", SHADOW_PRESETS)).toBe("md");
    expect(KEYWORD.parse("inner", SHADOW_PRESETS)).toBe("inner");
  });
  it("font-weight label matches → keyword", () => {
    expect(KEYWORD.parse("400", FONT_WEIGHT_PRESETS)).toBe("normal");
    expect(KEYWORD.parse("700", FONT_WEIGHT_PRESETS)).toBe("bold");
  });
  it("leading keyword label matches", () => {
    expect(KEYWORD.parse("1.25", LEADING_PRESETS)).toBe("tight");
  });
  it("unit-less decimal becomes bracket", () => {
    expect(KEYWORD.parse("1.4", LEADING_PRESETS)).toBe("[1.4]");
  });
  it("number-with-unit becomes bracket", () => {
    expect(KEYWORD.parse("0.05em", [])).toBe("[0.05em]");
  });
  it("arbitrary unit-less number → bracket", () => {
    expect(KEYWORD.parse("450", FONT_WEIGHT_PRESETS)).toBe("[450]");
  });
  it("multi-word raw value → bracketed with underscores", () => {
    expect(KEYWORD.parse("0 4px 12px rgba(0,0,0,.3)", [])).toBe("[0_4px_12px_rgba(0,0,0,.3)]");
  });
  it("bare keyword not in presets passes through", () => {
    // If user types e.g. a known class name we don't have as preset, still valid
    expect(KEYWORD.parse("mycustom", [])).toBe("mycustom");
  });
  it("clears empty", () => {
    expect(KEYWORD.parse("", SHADOW_PRESETS)).toBe("");
  });
});

describe("KEYWORD.format", () => {
  it("preset → label", () => {
    expect(KEYWORD.format("bold", FONT_WEIGHT_PRESETS)).toBe("700");
    expect(KEYWORD.format("md", SHADOW_PRESETS)).toBe("md");
  });
  it("bracket → inner", () => {
    expect(KEYWORD.format("[1.4]", [])).toBe("1.4");
    expect(KEYWORD.format("[450]", [])).toBe("450");
  });
  it("bare token w/o preset stays", () => {
    expect(KEYWORD.format("mycustom", [])).toBe("mycustom");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// RAW strategy — shadow free-form
// ══════════════════════════════════════════════════════════════════════════

describe("RAW.parse", () => {
  it("bracketed if not preset", () => {
    expect(RAW.parse("0 4px 12px #000", [])).toBe("[0_4px_12px_#000]");
  });
  it("preset match wins", () => {
    expect(RAW.parse("md", SHADOW_PRESETS)).toBe("md");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Field-level semantic tests — makes sure the panel contract holds end-to-end
// ══════════════════════════════════════════════════════════════════════════

describe("Field behavior — Inset (top/right/bottom/left)", () => {
  const p = (raw: string) => LENGTH.parse(raw, INSET_PRESETS);
  it("typing '27' produces top-[27px]-style value", () => expect(p("27")).toBe("[27px]"));
  it("typing '27px' produces [27px]", () => expect(p("27px")).toBe("[27px]"));
  it("typing '16px' collapses to bare '4'", () => expect(p("16px")).toBe("4"));
  it("typing '50%' maps to preset '1/2'", () => expect(p("50%")).toBe("1/2"));
  it("typing '100%' maps to preset 'full'", () => expect(p("100%")).toBe("full"));
  it("typing 'auto' maps to empty (preset label 'Auto')", () => expect(p("auto")).toBe(""));
  it("typing '-12px' allows negative inset", () => expect(p("-12px")).toBe("[-12px]"));
  it("typing '1.5rem'", () => expect(p("1.5rem")).toBe("[1.5rem]"));
  it("typing 'calc(100% - 20px)' brackets", () => expect(p("calc(100% - 20px)")).toBe("[calc(100%_-_20px)]"));
});

describe("Field behavior — Z-index", () => {
  const p = (raw: string) => INTEGER.parse(raw, Z_PRESETS);
  it("preset 10 stays bare", () => expect(p("10")).toBe("10"));
  it("arbitrary 1", () => expect(p("1")).toBe("[1]"));
  it("arbitrary 999", () => expect(p("999")).toBe("[999]"));
  it("negative -1", () => expect(p("-1")).toBe("[-1]"));
  it("'auto' clears", () => expect(p("auto")).toBe(""));
});

describe("Field behavior — Grid cols", () => {
  const p = (raw: string) => GRID_COLS.parse(raw, GRID_PRESETS);
  it("6 stays bare (tailwind has grid-cols-6)", () => expect(p("6")).toBe("6"));
  it("7 stays bare (in range)", () => expect(p("7")).toBe("7"));
  it("13 becomes repeat bracket", () => expect(p("13")).toBe("[repeat(13,minmax(0,1fr))]"));
  it("'200px 1fr' template", () => expect(p("200px 1fr")).toBe("[200px_1fr]"));
});

describe("Field behavior — W/H/Min/Max size", () => {
  const p = (raw: string) => LENGTH.parse(raw, SIZE_PRESETS);
  it("320px → bracket", () => expect(p("320px")).toBe("[320px]"));
  it("20rem → bracket", () => expect(p("20rem")).toBe("[20rem]"));
  it("'full' preset", () => expect(p("full")).toBe("full"));
  it("'50%' → '1/2'", () => expect(p("50%")).toBe("1/2"));
  it("'min-content' → 'min'", () => expect(p("min-content")).toBe("min"));
});

describe("Field behavior — Leading", () => {
  const p = (raw: string) => KEYWORD.parse(raw, LEADING_PRESETS);
  it("preset '1.25' → tight", () => expect(p("1.25")).toBe("tight"));
  it("arbitrary 1.4 → [1.4]", () => expect(p("1.4")).toBe("[1.4]"));
  it("arbitrary 28px → [28px]", () => expect(p("28px")).toBe("[28px]"));
});

describe("Field behavior — Tracking", () => {
  const TRACKING_PRESETS: Preset[] = [
    { value: "tight", label: "-0.025em" },
    { value: "wide", label: "0.025em" },
  ];
  const p = (raw: string) => KEYWORD.parse(raw, TRACKING_PRESETS);
  it("preset label matches", () => expect(p("-0.025em")).toBe("tight"));
  it("arbitrary letter-spacing → bracket", () => expect(p("0.1em")).toBe("0.1em".length > 0 ? "[0.1em]" : ""));
  it("arbitrary px letter-spacing → bracket", () => expect(p("2px")).toBe("[2px]"));
});

describe("Field behavior — Shadow", () => {
  const p = (raw: string) => KEYWORD.parse(raw, SHADOW_PRESETS);
  it("md preset", () => expect(p("md")).toBe("md"));
  it("custom shadow → bracket with underscores", () => {
    expect(p("0 4px 12px rgba(0,0,0,.3)")).toBe("[0_4px_12px_rgba(0,0,0,.3)]");
  });
  it("inner preset", () => expect(p("inner")).toBe("inner"));
});

describe("Field behavior — Font size", () => {
  const p = (raw: string) => LENGTH.parse(raw, FONT_SIZE_PRESETS);
  it("'20px' matches preset xl", () => expect(p("20px")).toBe("xl"));
  it("'1.5rem' → bracket", () => expect(p("1.5rem")).toBe("[1.5rem]"));
  it("'14' bare → [14px]", () => expect(p("14")).toBe("[14px]"));
  it("'clamp(1rem, 5vw, 3rem)' → bracket", () => {
    expect(p("clamp(1rem, 5vw, 3rem)")).toBe("[clamp(1rem,_5vw,_3rem)]");
  });
});

describe("Field behavior — Font weight", () => {
  const p = (raw: string) => KEYWORD.parse(raw, FONT_WEIGHT_PRESETS);
  it("preset '700' → 'bold'", () => expect(p("700")).toBe("bold"));
  it("'medium' → bare 'medium'", () => {
    // not in our preset subset — but still accepted verbatim
    expect(p("medium")).toBe("medium");
  });
  it("arbitrary 450 → [450]", () => expect(p("450")).toBe("[450]"));
});

describe("Field behavior — Opacity bracket", () => {
  // Opacity is handled in PropertiesPanel directly, not via a strategy.
  // Sanity: a bracket like [0.37] parses back to "37" via the panel's decoder.
  it("unsnapped fraction stays precise", () => {
    const val = "[0.37]";
    const frac = val.match(/^\[0?\.(\d+)\]$/);
    expect(frac).not.toBeNull();
    expect(Math.round(parseFloat(`0.${frac![1]}`) * 100)).toBe(37);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Edge cases
// ══════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════
// ANGLE strategy — rotate / skew / hue-rotate
// ══════════════════════════════════════════════════════════════════════════

describe("ANGLE.parse", () => {
  const ROTATE_PRESETS: Preset[] = [
    { value: "45",  label: "45deg" },
    { value: "90",  label: "90deg" },
    { value: "180", label: "180deg" },
  ];
  it("bare number → [Ndeg]", () => {
    expect(ANGLE.parse("45", [])).toBe("[45deg]");
    expect(ANGLE.parse("-30", [])).toBe("[-30deg]");
  });
  it("number+deg/rad/turn passes through bracketed", () => {
    expect(ANGLE.parse("45deg", [])).toBe("[45deg]");
    expect(ANGLE.parse("0.5turn", [])).toBe("[0.5turn]");
    expect(ANGLE.parse("1.2rad", [])).toBe("[1.2rad]");
  });
  it("preset label matches", () => {
    expect(ANGLE.parse("45deg", ROTATE_PRESETS)).toBe("45");
  });
  it("already-bracketed passes through", () => {
    expect(ANGLE.parse("[90deg]", [])).toBe("[90deg]");
  });
  it("clears empty", () => {
    expect(ANGLE.parse("", [])).toBe("");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// DURATION strategy — transition / delay
// ══════════════════════════════════════════════════════════════════════════

describe("DURATION.parse", () => {
  it("bare number → [Nms]", () => {
    expect(DURATION.parse("150", [])).toBe("[150ms]");
    expect(DURATION.parse("500", [])).toBe("[500ms]");
  });
  it("number+s/ms passes through bracketed", () => {
    expect(DURATION.parse("150ms", [])).toBe("[150ms]");
    expect(DURATION.parse("0.3s", [])).toBe("[0.3s]");
  });
  it("preset match wins", () => {
    const presets: Preset[] = [{ value: "300", label: "300ms" }];
    expect(DURATION.parse("300ms", presets)).toBe("300");
  });
  it("clears empty", () => {
    expect(DURATION.parse("", [])).toBe("");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// NUMBER strategy — unit-less scale, flex-grow
// ══════════════════════════════════════════════════════════════════════════

describe("NUMBER.parse", () => {
  it("bare integer → [N]", () => {
    expect(NUMBER.parse("100", [])).toBe("[100]");
    expect(NUMBER.parse("1.5", [])).toBe("[1.5]");
  });
  it("preset wins", () => {
    const presets: Preset[] = [{ value: "0", label: "0%" }];
    expect(NUMBER.parse("0%", presets)).toBe("0");
  });
  it("clears empty", () => {
    expect(NUMBER.parse("", [])).toBe("");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// edge cases (continued below)
// ══════════════════════════════════════════════════════════════════════════

describe("edge cases", () => {
  it("whitespace in raw is trimmed", () => {
    expect(LENGTH.parse("   27px   ", [])).toBe("[27px]");
  });
  it("empty preset list falls through to bracket for non-numeric", () => {
    expect(LENGTH.parse("unknown-thing", [])).toBe("[unknown-thing]");
  });
  it("preset with empty value ('Auto' → '')", () => {
    expect(LENGTH.parse("auto", INSET_PRESETS)).toBe("");
    // Empty value renders as empty text so the placeholder is visible —
    // not the preset label. Preset label displays when user explicitly
    // picked "Auto" from the dropdown which emits "" and this still shows
    // as empty — the placeholder should say "auto" instead.
    expect(LENGTH.format("", INSET_PRESETS)).toBe("");
  });
  it("INTEGER rejects decimals by bracketing them raw", () => {
    // INTEGER doesn't specifically reject — it just brackets what was typed.
    expect(INTEGER.parse("2.5", [])).toBe("[2.5]");
  });
});
