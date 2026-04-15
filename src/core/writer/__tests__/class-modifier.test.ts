import { describe, it, expect } from "vitest";
import { Project } from "ts-morph";
import { modifyClassName } from "../class-modifier.js";

/**
 * Each test builds an in-memory TSX source file, runs modifyClassName against
 * a target line, and asserts on the resulting source text. Line numbers are
 * 1-based to match ts-morph + the editor's source-map resolver.
 *
 * These tests cover common Tailwind + React className patterns that the
 * Canvas editor must preserve when writing back to source.
 */
function run(
  source: string,
  line: number,
  opts: { add?: string[]; remove?: string[]; column?: number } = {}
): string {
  const project = new Project({ useInMemoryFileSystem: true });
  const sf = project.createSourceFile("test.tsx", source);
  modifyClassName(sf, line, opts.column, opts.add, opts.remove);
  return sf.getFullText();
}

// ---------------------------------------------------------------------------
// 1. String literal: className="mt-4 p-2"
// ---------------------------------------------------------------------------
describe("string literal className", () => {
  it("adds a class to a plain string className", () => {
    const out = run(`export const A = () => <div className="mt-4" />;`, 1, {
      add: ["p-2"],
    });
    expect(out).toContain(`className="mt-4 p-2"`);
  });

  it("removes a class from a plain string className", () => {
    const out = run(`export const A = () => <div className="mt-4 p-2" />;`, 1, {
      remove: ["mt-4"],
    });
    expect(out).toContain(`className="p-2"`);
  });

  it("replaces a class in-place when both add and remove are single entries", () => {
    const out = run(
      `export const A = () => <div className="mt-4 p-2 text-sm" />;`,
      1,
      { add: ["mt-8"], remove: ["mt-4"] }
    );
    // mt-8 should land where mt-4 was (position preserved), not appended
    expect(out).toContain(`className="mt-8 p-2 text-sm"`);
  });

  it("does not duplicate when adding an already-present class", () => {
    const out = run(`export const A = () => <div className="mt-4 p-2" />;`, 1, {
      add: ["mt-4"],
    });
    expect(out).toContain(`className="mt-4 p-2"`);
  });

  it("preserves arbitrary values with brackets: text-[12px]", () => {
    const out = run(
      `export const A = () => <div className="text-[12px]" />;`,
      1,
      { add: ["text-[#1c1917]"] }
    );
    expect(out).toContain(`className="text-[12px] text-[#1c1917]"`);
  });

  it("preserves responsive and variant modifiers", () => {
    const out = run(
      `export const A = () => <div className="md:text-lg hover:text-gray-500" />;`,
      1,
      { add: ["focus:ring-2"] }
    );
    expect(out).toContain(
      `className="md:text-lg hover:text-gray-500 focus:ring-2"`
    );
  });

  it("preserves important modifier (!class)", () => {
    const out = run(`export const A = () => <div className="!mt-4" />;`, 1, {
      add: ["p-2"],
    });
    expect(out).toContain(`className="!mt-4 p-2"`);
  });

  it("handles group-hover: and peer-focus: variants", () => {
    const out = run(
      `export const A = () => <div className="group-hover:opacity-50" />;`,
      1,
      { add: ["peer-focus:ring-2"] }
    );
    expect(out).toContain(
      `className="group-hover:opacity-50 peer-focus:ring-2"`
    );
  });

  it("handles data-[state=open]: variants with brackets", () => {
    const out = run(
      `export const A = () => <div className="data-[state=open]:bg-white" />;`,
      1,
      { add: ["data-[state=closed]:bg-black"] }
    );
    expect(out).toContain(
      `className="data-[state=open]:bg-white data-[state=closed]:bg-black"`
    );
  });
});

// ---------------------------------------------------------------------------
// 2. String inside a JSX expression: className={"mt-4"}
// ---------------------------------------------------------------------------
describe("string literal inside JSX expression", () => {
  it("adds a class to {\"...\"}", () => {
    const out = run(`export const A = () => <div className={"mt-4"} />;`, 1, {
      add: ["p-2"],
    });
    expect(out).toContain(`className={"mt-4 p-2"}`);
  });
});

// ---------------------------------------------------------------------------
// 3. No-substitution template literal: className={`mt-4`}
// ---------------------------------------------------------------------------
describe("no-substitution template literal", () => {
  it("adds a class to a backtick template without interpolation", () => {
    const out = run(
      "export const A = () => <div className={`mt-4 p-2`} />;",
      1,
      { add: ["text-sm"] }
    );
    expect(out).toContain("`mt-4 p-2 text-sm`");
  });

  it("removes a class from a backtick template without interpolation", () => {
    const out = run(
      "export const A = () => <div className={`mt-4 p-2 text-sm`} />;",
      1,
      { remove: ["p-2"] }
    );
    expect(out).toContain("`mt-4 text-sm`");
  });
});

// ---------------------------------------------------------------------------
// 4. Template literal with interpolation: className={`base ${cond}`}
// ---------------------------------------------------------------------------
describe("template literal with interpolation", () => {
  it("adds a class to the static head of a template literal", () => {
    const out = run(
      "export const A = ({ x }: any) => <div className={`mt-4 ${x}`} />;",
      1,
      { add: ["p-2"] }
    );
    // New class is added to the static head (before the first ${})
    expect(out).toContain("`mt-4 p-2 ${x}`");
  });

  it("removes a class from the static head of a template literal", () => {
    const out = run(
      "export const A = ({ x }: any) => <div className={`mt-4 p-2 ${x}`} />;",
      1,
      { remove: ["mt-4"] }
    );
    expect(out).toContain("`p-2 ${x}`");
  });

  // This mirrors the real-world Sidebar.tsx example: template literal +
  // arbitrary values + ternary interpolation. We only touch the static head
  // — the dynamic ternary branches must be preserved verbatim.
  it("preserves a ternary interpolation when mutating static classes", () => {
    const source = [
      "export const A = ({ isActive }: any) => (",
      "  <a",
      "    className={`relative block py-1 text-[12px] transition-colors ${",
      "      isActive",
      `        ? "text-[#1c1917] font-semibold"`,
      `        : "text-[#a8a29e] hover:text-[#78716c]"`,
      "    }`}",
      "  />",
      ");",
    ].join("\n");
    const out = run(source, 2, { add: ["cursor-pointer"] });
    // Static head gets the new class
    expect(out).toContain("relative block py-1 text-[12px] transition-colors");
    expect(out).toContain("cursor-pointer");
    // Ternary branches are untouched
    expect(out).toContain(`? "text-[#1c1917] font-semibold"`);
    expect(out).toContain(`: "text-[#a8a29e] hover:text-[#78716c]"`);
  });

  it("preserves a logical-AND (short-circuit) interpolation", () => {
    const source =
      "export const A = ({ on }: any) => <div className={`base ${on && \"is-on\"}`} />;";
    const out = run(source, 1, { add: ["extra"] });
    expect(out).toContain("`base extra ${on && \"is-on\"}`");
  });

  it("preserves multiple interpolations", () => {
    const source =
      "export const A = ({ a, b }: any) => <div className={`base ${a} mid ${b}`} />;";
    const out = run(source, 1, { add: ["extra"] });
    // Only the static head ("base ") should change — "mid" lives in a
    // middle span that the current implementation does not touch.
    expect(out).toContain("`base extra ${a} mid ${b}`");
  });
});

// ---------------------------------------------------------------------------
// 5. cn() / clsx() call expression
// ---------------------------------------------------------------------------
describe("cn() / clsx() call expression", () => {
  it("adds a class to the first string argument of cn()", () => {
    const out = run(
      `export const A = ({ x }: any) => <div className={cn("mt-4", x && "p-2")} />;`,
      1,
      { add: ["text-sm"] }
    );
    expect(out).toContain(`cn("mt-4 text-sm", x && "p-2")`);
  });

  it("adds a class to the first string argument of clsx()", () => {
    const out = run(
      `export const A = ({ x }: any) => <div className={clsx("mt-4", { active: x })} />;`,
      1,
      { add: ["text-sm"] }
    );
    expect(out).toContain(`clsx("mt-4 text-sm", { active: x })`);
  });

  it("removes a class from the first string argument of cn()", () => {
    const out = run(
      `export const A = ({ x }: any) => <div className={cn("mt-4 p-2", x && "text-sm")} />;`,
      1,
      { remove: ["mt-4"] }
    );
    expect(out).toContain(`cn("p-2", x && "text-sm")`);
  });

  it("prepends a string arg to cn() when no string arg exists", () => {
    const out = run(
      `export const A = ({ x, y }: any) => <div className={cn(x, y)} />;`,
      1,
      { add: ["mt-4"] }
    );
    expect(out).toContain(`cn("mt-4", x, y)`);
  });

  it("preserves object and conditional args in cn()", () => {
    const out = run(
      `export const A = ({ on }: any) => <div className={cn("base", { active: on, disabled: !on })} />;`,
      1,
      { add: ["px-2"] }
    );
    expect(out).toContain(
      `cn("base px-2", { active: on, disabled: !on })`
    );
  });

  it("preserves ternary arg in cn()", () => {
    const out = run(
      `export const A = ({ on }: any) => <div className={cn("base", on ? "a" : "b")} />;`,
      1,
      { add: ["extra"] }
    );
    expect(out).toContain(`cn("base extra", on ? "a" : "b")`);
  });
});

// ---------------------------------------------------------------------------
// 6. Missing className attribute
// ---------------------------------------------------------------------------
describe("missing className attribute", () => {
  it("adds className attribute when none exists and classes are added", () => {
    const out = run(`export const A = () => <div id="x" />;`, 1, {
      add: ["mt-4", "p-2"],
    });
    expect(out).toMatch(/className="mt-4 p-2"/);
  });

  it("is a no-op when className is missing and only `remove` is supplied", () => {
    const src = `export const A = () => <div id="x" />;`;
    const out = run(src, 1, { remove: ["mt-4"] });
    expect(out).toBe(src);
  });

  it("adds className to a self-closing element without any attributes", () => {
    const out = run(`export const A = () => <img />;`, 1, { add: ["w-full"] });
    expect(out).toMatch(/className="w-full"/);
  });
});

// ---------------------------------------------------------------------------
// 7. Edge cases in source geometry
// ---------------------------------------------------------------------------
describe("source geometry edge cases", () => {
  it("disambiguates multiple JSX elements on the same line via column", () => {
    const source = `export const A = () => <><span className="a" /><span className="b" /></>;`;
    const firstColumn = source.indexOf("<span"); // 0-based column of first <span>
    const secondColumn = source.indexOf("<span", firstColumn + 1);
    // Target the second <span> — its class is "b"
    const out = run(source, 1, { add: ["x"], column: secondColumn });
    expect(out).toContain(`className="a"`);
    expect(out).toContain(`className="b x"`);
  });

  it("throws when no JSX element exists at the given line", () => {
    expect(() =>
      run(`export const A = () => <div />;\n// just a comment`, 2, {
        add: ["mt-4"],
      })
    ).toThrow(/No JSX element found/);
  });

  it("handles self-closing elements with an existing className", () => {
    const out = run(
      `export const A = () => <img className="w-4" src="/x.png" />;`,
      1,
      { add: ["h-4"] }
    );
    expect(out).toContain(`className="w-4 h-4"`);
  });

  it("is a no-op on add=[] remove=[]", () => {
    const src = `export const A = () => <div className="mt-4" />;`;
    const out = run(src, 1, { add: [], remove: [] });
    expect(out).toBe(src);
  });

  it("preserves other attributes when modifying className", () => {
    const out = run(
      `export const A = () => <button id="btn" className="bg-blue-500" onClick={() => {}} type="button" />;`,
      1,
      { add: ["text-white"] }
    );
    expect(out).toContain(`id="btn"`);
    expect(out).toContain(`onClick={() => {}}`);
    expect(out).toContain(`type="button"`);
    expect(out).toContain(`className="bg-blue-500 text-white"`);
  });
});

// ---------------------------------------------------------------------------
// 8. Patterns that are NOT yet supported — documented via xit so they don't
//    fail CI, but make the coverage gap visible. Flip xit -> it once the
//    class-modifier grows a handler for each.
// ---------------------------------------------------------------------------
describe("additional JSX expression kinds", () => {
  it("handles a ternary directly as the JSX expression", () => {
    const out = run(
      `export const A = ({ on }: any) => <div className={on ? "mt-4" : "mt-0"} />;`,
      1,
      { add: ["p-2"] }
    );
    // Applied to both branches.
    expect(out).toContain(`on ? "mt-4 p-2" : "mt-0 p-2"`);
  });

  it("handles a logical-AND directly as the JSX expression", () => {
    const out = run(
      `export const A = ({ on }: any) => <div className={on && "mt-4"} />;`,
      1,
      { add: ["p-2"] }
    );
    expect(out).toContain(`on && "mt-4 p-2"`);
  });

  it("handles string concatenation expression", () => {
    const out = run(
      `export const A = ({ b }: any) => <div className={"mt-4 " + b} />;`,
      1,
      { add: ["p-2"] }
    );
    expect(out).toContain(`"mt-4 p-2 " + b`);
  });

  it("handles array-join expression", () => {
    const out = run(
      `export const A = () => <div className={["mt-4", "p-2"].join(" ")} />;`,
      1,
      { add: ["text-sm"] }
    );
    // First string-literal element gets the new class.
    expect(out).toContain(`["mt-4 text-sm", "p-2"].join(" ")`);
  });

  // cva(): className={buttonVariants({ variant: "default" })}. The modifier
  // only auto-prepends a string arg for known merger helpers (cn/clsx/...)
  // so cva-like calls are left alone instead of getting a bogus first arg.
  it("does not corrupt a cva()-style call", () => {
    const src = `export const A = () => <div className={buttonVariants({ variant: "default" })} />;`;
    const out = run(src, 1, { add: ["mt-4"] });
    expect(out).not.toContain(`buttonVariants("mt-4"`);
    // The call is preserved verbatim — today we cannot safely add the class,
    // but we do not destroy the source either.
    expect(out).toContain(`buttonVariants({ variant: "default" })`);
  });
});

// ---------------------------------------------------------------------------
// 9. Full Tailwind surface area — arbitrary values, CSS functions, modifiers.
//     These live on string-literal classNames so they exercise applyClassChanges
//     more than the JSX-expression paths above.
// ---------------------------------------------------------------------------
describe("arbitrary values and CSS functions", () => {
  it("preserves calc() arbitrary width", () => {
    const out = run(
      `export const A = () => <div className="w-[calc(100%-2rem)]" />;`,
      1,
      { add: ["h-[calc(100vh-4rem)]"] }
    );
    expect(out).toContain(
      `className="w-[calc(100%-2rem)] h-[calc(100vh-4rem)]"`
    );
  });

  it("preserves min() / max() / clamp() arbitrary values", () => {
    const out = run(
      `export const A = () => <div className="w-[min(100%,32rem)] max-w-[clamp(20rem,50vw,40rem)]" />;`,
      1,
      { add: ["min-h-[max(10rem,20vh)]"] }
    );
    expect(out).toContain(`w-[min(100%,32rem)]`);
    expect(out).toContain(`max-w-[clamp(20rem,50vw,40rem)]`);
    expect(out).toContain(`min-h-[max(10rem,20vh)]`);
  });

  it("preserves negative arbitrary values", () => {
    const out = run(
      `export const A = () => <div className="-mt-[10px] -ml-[calc(50%+1rem)]" />;`,
      1,
      { add: ["-mr-[2rem]"] }
    );
    expect(out).toContain(`-mt-[10px]`);
    expect(out).toContain(`-ml-[calc(50%+1rem)]`);
    expect(out).toContain(`-mr-[2rem]`);
  });

  it("preserves opacity slash syntax (bg-red-500/50)", () => {
    const out = run(
      `export const A = () => <div className="bg-red-500/50 text-white/75" />;`,
      1,
      { add: ["border-black/25"] }
    );
    expect(out).toContain(`bg-red-500/50`);
    expect(out).toContain(`text-white/75`);
    expect(out).toContain(`border-black/25`);
  });

  it("preserves CSS-variable arbitrary values", () => {
    const out = run(
      `export const A = () => <div className="w-[var(--size)] bg-[var(--brand,red)]" />;`,
      1,
      { add: ["text-[var(--fg)]"] }
    );
    expect(out).toContain(`w-[var(--size)]`);
    expect(out).toContain(`bg-[var(--brand,red)]`);
    expect(out).toContain(`text-[var(--fg)]`);
  });

  it("preserves arbitrary properties [prop:value] and custom var setters", () => {
    const out = run(
      `export const A = () => <div className="[mask-type:alpha] [--my-var:1rem]" />;`,
      1,
      { add: ["[contain:layout_paint]"] }
    );
    expect(out).toContain(`[mask-type:alpha]`);
    expect(out).toContain(`[--my-var:1rem]`);
    expect(out).toContain(`[contain:layout_paint]`);
  });

  it("preserves arbitrary grid templates with underscore spaces", () => {
    const out = run(
      `export const A = () => <div className="grid-cols-[1fr_2fr_1fr] grid-rows-[auto_1fr_auto]" />;`,
      1,
      { add: ["gap-[0.5rem]"] }
    );
    expect(out).toContain(`grid-cols-[1fr_2fr_1fr]`);
    expect(out).toContain(`grid-rows-[auto_1fr_auto]`);
    expect(out).toContain(`gap-[0.5rem]`);
  });

  it("preserves arbitrary animations and transforms", () => {
    const out = run(
      `export const A = () => <div className="animate-[wiggle_1s_ease-in-out_infinite] rotate-[15deg] translate-x-[50%]" />;`,
      1,
      { add: ["scale-[1.05]"] }
    );
    expect(out).toContain(`animate-[wiggle_1s_ease-in-out_infinite]`);
    expect(out).toContain(`rotate-[15deg]`);
    expect(out).toContain(`translate-x-[50%]`);
    expect(out).toContain(`scale-[1.05]`);
  });

  it("preserves arbitrary font families and numeric weights", () => {
    const out = run(
      `export const A = () => <div className="font-[Inter] font-[500] tracking-[0.01em]" />;`,
      1,
      { add: ["leading-[1.6]"] }
    );
    expect(out).toContain(`font-[Inter]`);
    expect(out).toContain(`font-[500]`);
    expect(out).toContain(`tracking-[0.01em]`);
    expect(out).toContain(`leading-[1.6]`);
  });

  it("preserves arbitrary filters and drop-shadows with commas and parens", () => {
    const out = run(
      `export const A = () => <div className="blur-[2px] drop-shadow-[0_4px_8px_rgba(0,0,0,0.1)]" />;`,
      1,
      { add: ["backdrop-blur-[12px]"] }
    );
    expect(out).toContain(`blur-[2px]`);
    expect(out).toContain(`drop-shadow-[0_4px_8px_rgba(0,0,0,0.1)]`);
    expect(out).toContain(`backdrop-blur-[12px]`);
  });

  it("preserves before:/after:content-['…'] with quoted arbitrary value", () => {
    const out = run(
      `export const A = () => <div className="before:content-['•'] after:content-['→']" />;`,
      1,
      { add: ["before:text-red-500"] }
    );
    expect(out).toContain(`before:content-['•']`);
    expect(out).toContain(`after:content-['→']`);
    expect(out).toContain(`before:text-red-500`);
  });

  it("preserves gradient stop classes", () => {
    const out = run(
      `export const A = () => <div className="bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500" />;`,
      1,
      { add: ["from-[10%]"] }
    );
    expect(out).toContain(
      `bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500 from-[10%]`
    );
  });

  it("preserves container-query @md:/@container modifiers", () => {
    const out = run(
      `export const A = () => <div className="@container @md:text-lg @lg:grid-cols-2" />;`,
      1,
      { add: ["@sm:px-4"] }
    );
    expect(out).toContain(`@container`);
    expect(out).toContain(`@md:text-lg`);
    expect(out).toContain(`@lg:grid-cols-2`);
    expect(out).toContain(`@sm:px-4`);
  });

  it("preserves stacked variant selectors (dark:md:hover:...)", () => {
    const out = run(
      `export const A = () => <div className="dark:md:hover:bg-neutral-800" />;`,
      1,
      { add: ["dark:md:hover:text-white"] }
    );
    expect(out).toContain(`dark:md:hover:bg-neutral-800`);
    expect(out).toContain(`dark:md:hover:text-white`);
  });

  it("removes a single arbitrary-value class without disturbing siblings", () => {
    const out = run(
      `export const A = () => <div className="w-[calc(100%-2rem)] h-[calc(100vh-4rem)] text-[12px]" />;`,
      1,
      { remove: ["h-[calc(100vh-4rem)]"] }
    );
    expect(out).toContain(
      `className="w-[calc(100%-2rem)] text-[12px]"`
    );
  });

  it("in-place replaces an arbitrary calc value", () => {
    const out = run(
      `export const A = () => <div className="mt-4 w-[calc(100%-2rem)] p-2" />;`,
      1,
      {
        add: ["w-[calc(100%-4rem)]"],
        remove: ["w-[calc(100%-2rem)]"],
      }
    );
    expect(out).toContain(
      `className="mt-4 w-[calc(100%-4rem)] p-2"`
    );
  });
});
