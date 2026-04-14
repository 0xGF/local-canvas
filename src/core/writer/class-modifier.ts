import {
  type SourceFile,
  SyntaxKind,
  type JsxAttribute,
  type StringLiteral,
  type CallExpression,
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
      const updated = applyClassChanges(headText, add, remove);
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
      } else if (add && add.length > 0) {
        // No string arg — prepend one
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
  }
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
