import {
  type SourceFile,
  SyntaxKind,
  type JsxAttribute,
  type StringLiteral,
  type CallExpression,
  type Node,
  type ConditionalExpression,
  type BinaryExpression,
  type ArrayLiteralExpression,
  type PropertyAccessExpression,
} from "ts-morph";

export function modifyClassName(
  sourceFile: SourceFile,
  line: number,
  column: number | undefined,
  add?: string[],
  remove?: string[]
): void {
  const target = findJsxElementAtLine(sourceFile, line, column);
  if (!target) {
    throw new Error(`No JSX element found at line ${line}`);
  }

  const classAttr = target.getAttribute("className") as
    | JsxAttribute
    | undefined;

  if (!classAttr) {
    // No className — add one with the new classes
    if (add && add.length > 0) {
      target.addAttribute({
        name: "className",
        initializer: `"${add.join(" ")}"`,
      });
    }
    return;
  }

  const initializer = classAttr.getInitializer();

  if (!initializer) return;

  // Pattern 1: className="mt-4 p-2"
  if (initializer.isKind(SyntaxKind.StringLiteral)) {
    const literal = initializer as StringLiteral;
    const updated = applyClassChanges(
      literal.getLiteralValue(),
      add,
      remove
    );
    literal.setLiteralValue(updated);
    return;
  }

  // Pattern 2 & 3: className={...}
  if (initializer.isKind(SyntaxKind.JsxExpression)) {
    const expr = initializer.getExpression();
    if (!expr) return;

    // Template literal: className={`mt-4 ${...}`}
    if (expr.isKind(SyntaxKind.TemplateExpression)) {
      const head = expr.getHead();
      const headText = head.compilerNode.text;
      // Preserve a leading/trailing space around ${...} — applyClassChanges
      // collapses whitespace, so if the head was "mt-4 " the result would
      // be "mt-4" and we'd render `mt-4${x}` (bug). Re-attach the edge space.
      const leadingSpace = /^\s/.test(headText) ? " " : "";
      const trailingSpace = /\s$/.test(headText) ? " " : "";
      const updated =
        leadingSpace + applyClassChanges(headText, add, remove) + trailingSpace;
      // TemplateHead text is between ` and ${, so reconstruct it
      const raw = head.getText();
      const newRaw = raw.replace(headText, updated);
      head.replaceWithText(newRaw);
      return;
    }

    if (expr.isKind(SyntaxKind.NoSubstitutionTemplateLiteral)) {
      const current = expr.getLiteralValue();
      const updated = applyClassChanges(current, add, remove);
      expr.setLiteralValue(updated);
      return;
    }

    // Array-join: className={["a", "b"].join(" ")} — must be checked before
    // the generic CallExpression branch, otherwise the cn()/clsx() handler
    // would mutate the join separator (the " " argument) instead of the array.
    if (expr.isKind(SyntaxKind.CallExpression)) {
      const call = expr as CallExpression;
      const callee = call.getExpression();
      if (callee.isKind(SyntaxKind.PropertyAccessExpression)) {
        const prop = callee as PropertyAccessExpression;
        if (
          prop.getName() === "join" &&
          prop.getExpression().isKind(SyntaxKind.ArrayLiteralExpression)
        ) {
          const arr = prop.getExpression() as ArrayLiteralExpression;
          const elements = arr.getElements();
          const firstString = elements.find((e) =>
            e.isKind(SyntaxKind.StringLiteral)
          );
          if (firstString) {
            const literal = firstString as StringLiteral;
            const updated = applyClassChanges(
              literal.getLiteralValue(),
              add,
              remove
            );
            literal.setLiteralValue(updated);
          }
          return;
        }
      }
    }

    // cn() or clsx() call: className={cn("mt-4", ...)}
    if (expr.isKind(SyntaxKind.CallExpression)) {
      const call = expr as CallExpression;
      const args = call.getArguments();
      const firstString = args.find((a) => a.isKind(SyntaxKind.StringLiteral));

      if (firstString) {
        const literal = firstString as StringLiteral;
        const updated = applyClassChanges(
          literal.getLiteralValue(),
          add,
          remove
        );
        literal.setLiteralValue(updated);
      } else if (add && add.length > 0 && isKnownClassMerger(call)) {
        // Only prepend a base-class string arg for known merger helpers
        // (cn/clsx/twMerge/classnames). For arbitrary calls — e.g.
        // cva-generated variant functions like `buttonVariants({ variant })`
        // — injecting "mt-4" as the first arg would corrupt the call signature.
        const existingText = call.getText();
        const fnName = existingText.split("(")[0];
        call.replaceWithText(
          `${fnName}("${add.join(" ")}", ${args.map((a) => a.getText()).join(", ")})`
        );
      }
      return;
    }

    // Simple string in JSX expression: className={"mt-4 p-2"}
    if (expr.isKind(SyntaxKind.StringLiteral)) {
      const literal = expr as StringLiteral;
      const updated = applyClassChanges(
        literal.getLiteralValue(),
        add,
        remove
      );
      literal.setLiteralValue(updated);
      return;
    }

    // Ternary: className={cond ? "a" : "b"} — apply to both branches
    if (expr.isKind(SyntaxKind.ConditionalExpression)) {
      const cond = expr as ConditionalExpression;
      applyToExpression(cond.getWhenTrue(), add, remove);
      applyToExpression(cond.getWhenFalse(), add, remove);
      return;
    }

    // Logical-AND or string concat: className={on && "a"} / {"a " + b}
    if (expr.isKind(SyntaxKind.BinaryExpression)) {
      const bin = expr as BinaryExpression;
      const op = bin.getOperatorToken().getKind();
      if (op === SyntaxKind.AmpersandAmpersandToken) {
        // Short-circuit — only the right operand becomes the className value
        applyToExpression(bin.getRight(), add, remove);
        return;
      }
      if (op === SyntaxKind.PlusToken) {
        // Concatenation — mutate every string-literal operand in the chain.
        // We need to be space-aware so that "mt-4 " + b + " p-2" keeps its
        // separators when we rewrite one of the literals.
        for (const operand of flattenPlus(bin)) {
          if (operand.isKind(SyntaxKind.StringLiteral)) {
            applyConcatOperand(operand as StringLiteral, add, remove);
          }
        }
        return;
      }
    }

  }
}

// Recurse into branches of a ternary inside a ternary, etc. Anything that
// isn't a StringLiteral falls through silently — that's correct, since we
// can only mutate string-typed branches safely.
function applyToExpression(
  node: Node | undefined,
  add?: string[],
  remove?: string[]
): void {
  if (!node) return;
  if (node.isKind(SyntaxKind.StringLiteral)) {
    const lit = node as StringLiteral;
    lit.setLiteralValue(applyClassChanges(lit.getLiteralValue(), add, remove));
    return;
  }
  if (node.isKind(SyntaxKind.ConditionalExpression)) {
    const cond = node as ConditionalExpression;
    applyToExpression(cond.getWhenTrue(), add, remove);
    applyToExpression(cond.getWhenFalse(), add, remove);
    return;
  }
  // Template literal, identifier, etc. — leave untouched. Adding classes to
  // a dynamic branch would change runtime semantics in ways we can't predict.
}

// Flatten nested `+` operators: ((a + b) + c) → [a, b, c]
function flattenPlus(bin: BinaryExpression): Node[] {
  const out: Node[] = [];
  const walk = (n: Node) => {
    if (
      n.isKind(SyntaxKind.BinaryExpression) &&
      (n as BinaryExpression).getOperatorToken().getKind() ===
        SyntaxKind.PlusToken
    ) {
      walk((n as BinaryExpression).getLeft());
      walk((n as BinaryExpression).getRight());
      return;
    }
    out.push(n);
  };
  walk(bin);
  return out;
}

// String-concat operand mutation: preserve the operand's existing
// leading/trailing space so that `"mt-4 " + b` stays `"mt-4 p-2 " + b` and
// doesn't collapse into `"mt-4 p-2" + b` (which would glue classes together).
function applyConcatOperand(
  literal: StringLiteral,
  add?: string[],
  remove?: string[]
): void {
  const current = literal.getLiteralValue();
  const leading = /^\s/.test(current) ? " " : "";
  const trailing = /\s$/.test(current) ? " " : "";
  const updated = leading + applyClassChanges(current, add, remove) + trailing;
  literal.setLiteralValue(updated);
}

// Helpers like cn()/clsx()/twMerge() are safe to prepend a string arg to.
// Other calls (e.g. cva variant helpers) take structured args and should not
// be mutated by className edits.
const KNOWN_CLASS_MERGERS = new Set([
  "cn",
  "clsx",
  "classnames",
  "twMerge",
  "twJoin",
]);

function isKnownClassMerger(call: CallExpression): boolean {
  const expr = call.getExpression();
  const name = expr.getText();
  // Handle bare identifiers and simple member access like `utils.cn`
  const lastSegment = name.split(".").pop() ?? name;
  return KNOWN_CLASS_MERGERS.has(lastSegment);
}

function applyClassChanges(
  current: string,
  add?: string[],
  remove?: string[]
): string {
  let classes = current
    .split(/\s+/)
    .filter(Boolean);

  if (remove && add && remove.length === 1 && add.length === 1) {
    // Replace in-place: put the new class where the old one was
    const idx = classes.indexOf(remove[0]);
    if (idx !== -1) {
      classes[idx] = add[0];
      return classes.join(" ");
    }
  }

  if (remove) {
    classes = classes.filter((c) => !remove.includes(c));
  }

  if (add) {
    for (const cls of add) {
      if (!classes.includes(cls)) {
        classes.push(cls);
      }
    }
  }

  return classes.join(" ");
}

function findJsxElementAtLine(
  sourceFile: SourceFile,
  line: number,
  column?: number
) {
  const openingElements = sourceFile.getDescendantsOfKind(
    SyntaxKind.JsxOpeningElement
  );
  const selfClosing = sourceFile.getDescendantsOfKind(
    SyntaxKind.JsxSelfClosingElement
  );

  const allElements = [...openingElements, ...selfClosing];

  // Filter by line
  const onLine = allElements.filter(
    (el) => el.getStartLineNumber() === line
  );

  if (onLine.length === 0) return null;
  if (onLine.length === 1) return onLine[0];

  // Multiple elements on same line — use column to disambiguate
  if (column !== undefined) {
    const match = onLine.find((el) => {
      const start = el.getStart();
      const pos = sourceFile.getLineAndColumnAtPos(start);
      return pos.column - 1 === column; // ts-morph is 1-based
    });
    if (match) return match;
  }

  // Fallback to first element on line
  return onLine[0];
}
