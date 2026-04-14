import { type SourceFile, SyntaxKind } from "ts-morph";

export function deleteElement(
  sourceFile: SourceFile,
  line: number,
  column?: number
): void {
  const target = findElementAtLine(sourceFile, line, column);
  if (!target) {
    throw new Error(`No JSX element found at line ${line}`);
  }

  // If it's a JsxOpeningElement, we need to remove the full JsxElement
  const toRemove = target.isKind(SyntaxKind.JsxOpeningElement)
    ? target.getParentIfKind(SyntaxKind.JsxElement) || target
    : target;

  // Remove the element text and any leading whitespace on its line
  const fullText = sourceFile.getFullText();
  let start = toRemove.getStart();
  let end = toRemove.getEnd();

  // Extend to remove the full line if it's the only content
  const lineStart = fullText.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = fullText.indexOf("\n", end);
  const beforeOnLine = fullText.substring(lineStart, start).trim();
  const afterOnLine = fullText
    .substring(end, lineEnd === -1 ? fullText.length : lineEnd)
    .trim();

  if (!beforeOnLine && !afterOnLine) {
    start = lineStart;
    end = lineEnd === -1 ? fullText.length : lineEnd + 1;
  }

  const newText = fullText.substring(0, start) + fullText.substring(end);
  sourceFile.replaceWithText(newText);
}

export function modifyText(
  sourceFile: SourceFile,
  line: number,
  column: number | undefined,
  newText: string
): void {
  const target = findElementAtLine(sourceFile, line, column);
  if (!target) {
    throw new Error(`No JSX element found at line ${line}`);
  }

  // Find the parent JsxElement to access its children
  const parent = target.isKind(SyntaxKind.JsxOpeningElement)
    ? target.getParentIfKind(SyntaxKind.JsxElement)
    : null;

  if (!parent) {
    throw new Error("Cannot modify text of a self-closing element");
  }

  // Find JsxText children
  const textChildren = parent
    .getJsxChildren()
    .filter((c) => c.isKind(SyntaxKind.JsxText));

  if (textChildren.length === 0) {
    // No text children — insert text between opening and closing tags
    const opening = parent.getOpeningElement();
    const closing = parent.getClosingElement();
    const fullSource = sourceFile.getFullText();
    const result =
      fullSource.substring(0, opening.getEnd()) +
      newText +
      fullSource.substring(closing.getStart());
    sourceFile.replaceWithText(result);
  } else {
    // Replace first text child
    const firstText = textChildren[0];
    const fullSource = sourceFile.getFullText();
    const result =
      fullSource.substring(0, firstText.getStart()) +
      newText +
      fullSource.substring(firstText.getEnd());
    sourceFile.replaceWithText(result);
  }
}

export function duplicateElement(
  sourceFile: SourceFile,
  line: number,
  column?: number
): void {
  const target = findElementAtLine(sourceFile, line, column);
  if (!target) {
    throw new Error(`No JSX element found at line ${line}`);
  }

  const toDuplicate = target.isKind(SyntaxKind.JsxOpeningElement)
    ? target.getParentIfKind(SyntaxKind.JsxElement) || target
    : target;

  const elementText = toDuplicate.getFullText();
  const fullText = sourceFile.getFullText();
  const end = toDuplicate.getEnd();

  const newText = fullText.substring(0, end) + "\n" + elementText.trimStart() + fullText.substring(end);
  sourceFile.replaceWithText(newText);
}

function findElementAtLine(
  sourceFile: SourceFile,
  line: number,
  column?: number
) {
  const elements = [
    ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
    ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
  ];

  const onLine = elements.filter((el) => el.getStartLineNumber() === line);

  if (onLine.length === 0) return null;
  if (onLine.length === 1) return onLine[0];

  if (column !== undefined) {
    const match = onLine.find((el) => {
      const pos = sourceFile.getLineAndColumnAtPos(el.getStart());
      return pos.column - 1 === column;
    });
    if (match) return match;
  }

  return onLine[0];
}
