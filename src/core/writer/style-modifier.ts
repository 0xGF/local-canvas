import {
  type SourceFile,
  SyntaxKind,
  type JsxAttribute,
  type ObjectLiteralExpression,
  type PropertyAssignment,
  type ShorthandPropertyAssignment,
  type StringLiteral,
  type NumericLiteral,
  type Identifier,
  Node,
} from "ts-morph";

/**
 * Mutate the inline `style={{ ... }}` object on a JSX element at the given
 * position. Mirrors the line/column targeting pattern in class-modifier.ts.
 *
 * - `value === undefined` removes the property if present.
 * - Otherwise the property is added or updated in place. The written value
 *   preserves the quoting/style of the existing value where possible:
 *     existing "16px" + new "24px" → "24px"
 *     existing 16 (numeric) + new "24px" → "24px"
 *     existing 16 (numeric) + new "32"   → 32 (numeric)
 *
 * Returns `true` if the style object was successfully mutated, `false` if
 * the element uses an unmutable pattern (no style attribute, style={expr},
 * style={...spread}-only, etc.). The caller decides how to react — typically
 * by falling back to class-modifier or surfacing a read-only hint in the UI.
 */
export function modifyStyle(
  sourceFile: SourceFile,
  line: number,
  column: number | undefined,
  property: string,
  value: string | undefined,
): boolean {
  const target = findJsxElementAtLine(sourceFile, line, column);
  if (!target) {
    throw new Error(`No JSX element found at line ${line}`);
  }

  const styleAttr = target.getAttribute("style") as JsxAttribute | undefined;

  if (!styleAttr) {
    // No style attribute — add one with the new property.
    if (value === undefined) return true; // nothing to remove
    target.addAttribute({
      name: "style",
      initializer: `{{ ${formatKey(property)}: ${formatValue(value, "string")} }}`,
    });
    return true;
  }

  const initializer = styleAttr.getInitializer();
  if (!initializer || !initializer.isKind(SyntaxKind.JsxExpression)) return false;

  const expr = initializer.getExpression();
  if (!expr) return false;

  // We only safely mutate object literals: style={{ ... }}.
  if (!expr.isKind(SyntaxKind.ObjectLiteralExpression)) return false;

  return mutateObjectLiteral(expr as ObjectLiteralExpression, property, value);
}

function mutateObjectLiteral(
  obj: ObjectLiteralExpression,
  property: string,
  value: string | undefined,
): boolean {
  const existing = findProperty(obj, property);

  if (existing) {
    if (value === undefined) {
      existing.remove();
      return true;
    }
    return updateProperty(existing, value);
  }

  if (value === undefined) return true; // nothing to remove

  // Add the property, matching the key style of any neighbour.
  const neighbour = obj.getProperties().find((p) =>
    p.isKind(SyntaxKind.PropertyAssignment),
  ) as PropertyAssignment | undefined;
  const useStringKey = neighbour
    ? neighbour.getNameNode().isKind(SyntaxKind.StringLiteral)
    : needsStringKey(property);
  obj.addPropertyAssignment({
    name: useStringKey ? `"${property}"` : formatKey(property),
    initializer: formatValue(value, "string"),
  });
  return true;
}

/**
 * Replace the value on an existing property assignment, preserving the form
 * of the previous value where possible (numeric stays numeric, string stays
 * string).
 */
function updateProperty(
  prop: PropertyAssignment | ShorthandPropertyAssignment,
  value: string,
): boolean {
  // Shorthand (`{ color }`) — rewrite as a full assignment so we actually
  // set a concrete value instead of relying on an identifier in scope.
  if (prop.isKind(SyntaxKind.ShorthandPropertyAssignment)) {
    const name = (prop as ShorthandPropertyAssignment).getNameNode().getText();
    prop.replaceWithText(`${name}: ${formatValue(value, "string")}`);
    return true;
  }

  const assignment = prop as PropertyAssignment;
  const initializer = assignment.getInitializer();
  if (!initializer) return false;

  // Don't mutate computed / non-literal values (template strings with
  // interpolation, ternaries, function calls, identifiers). They encode
  // runtime behaviour we can't safely rewrite.
  const form = detectValueForm(initializer);
  if (form === "unmutable") return false;

  assignment.setInitializer(formatValue(value, form));
  return true;
}

type ValueForm = "string" | "number" | "unmutable";

function detectValueForm(node: Node): ValueForm {
  if (node.isKind(SyntaxKind.StringLiteral)) return "string";
  if (node.isKind(SyntaxKind.NumericLiteral)) return "number";
  if (node.isKind(SyntaxKind.NoSubstitutionTemplateLiteral)) return "string";
  // PrefixUnaryExpression covers `-16` — still numeric in practice.
  if (node.isKind(SyntaxKind.PrefixUnaryExpression)) {
    const operand = (node as { getOperand: () => Node }).getOperand?.();
    if (operand && operand.isKind(SyntaxKind.NumericLiteral)) return "number";
  }
  return "unmutable";
}

function formatValue(value: string, form: ValueForm): string {
  if (form === "number") {
    // Only stay numeric if the new value parses cleanly as a number. Drag
    // handlers can legitimately produce "16px" — in that case fall back to
    // a string literal so we don't emit `padding: 16px` (a syntax error).
    const n = Number(value);
    if (Number.isFinite(n) && String(n) === value.trim()) {
      return String(n);
    }
  }
  // Default: string literal. Escape any embedded double-quote.
  return `"${value.replace(/"/g, '\\"')}"`;
}

function findProperty(
  obj: ObjectLiteralExpression,
  name: string,
): PropertyAssignment | ShorthandPropertyAssignment | undefined {
  for (const prop of obj.getProperties()) {
    if (prop.isKind(SyntaxKind.PropertyAssignment)) {
      const assignment = prop as PropertyAssignment;
      if (keyText(assignment.getNameNode()) === name) return assignment;
    } else if (prop.isKind(SyntaxKind.ShorthandPropertyAssignment)) {
      const short = prop as ShorthandPropertyAssignment;
      if (short.getNameNode().getText() === name) return short;
    }
    // SpreadAssignment / MethodDeclaration etc. — skip, we don't mutate them.
  }
  return undefined;
}

function keyText(nameNode: Node): string {
  if (nameNode.isKind(SyntaxKind.Identifier)) {
    return (nameNode as Identifier).getText();
  }
  if (nameNode.isKind(SyntaxKind.StringLiteral)) {
    return (nameNode as StringLiteral).getLiteralValue();
  }
  if (nameNode.isKind(SyntaxKind.NumericLiteral)) {
    return (nameNode as NumericLiteral).getText();
  }
  // Computed property name — fall back to the raw text so callers never
  // accidentally match "foo" against [foo].
  return nameNode.getText();
}

/** CSS custom properties and any dashed / non-identifier keys need quotes. */
function needsStringKey(name: string): boolean {
  return !/^[A-Za-z_$][\w$]*$/.test(name);
}

function formatKey(name: string): string {
  return needsStringKey(name) ? `"${name}"` : name;
}

// ---------------------------------------------------------------------------
// Copied from class-modifier so both writers share the same targeting rules.
// Kept as a local helper rather than a shared import to avoid coupling the
// two modules across future edits.
// ---------------------------------------------------------------------------
function findJsxElementAtLine(
  sourceFile: SourceFile,
  line: number,
  column?: number,
) {
  const openingElements = sourceFile.getDescendantsOfKind(
    SyntaxKind.JsxOpeningElement,
  );
  const selfClosing = sourceFile.getDescendantsOfKind(
    SyntaxKind.JsxSelfClosingElement,
  );
  const allElements = [...openingElements, ...selfClosing];

  const onLine = allElements.filter((el) => el.getStartLineNumber() === line);
  if (onLine.length === 0) return null;
  if (onLine.length === 1) return onLine[0];

  if (column !== undefined) {
    const match = onLine.find((el) => {
      const start = el.getStart();
      const pos = sourceFile.getLineAndColumnAtPos(start);
      return pos.column - 1 === column;
    });
    if (match) return match;
  }
  return onLine[0];
}
