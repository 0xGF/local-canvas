import { type SourceFile, SyntaxKind } from "ts-morph";

export function reorderChildren(
  sourceFile: SourceFile,
  parentLine: number,
  fromIndex: number,
  toIndex: number
): void {
  // Find the parent JSX element at the given line
  const jsxElements = sourceFile.getDescendantsOfKind(
    SyntaxKind.JsxElement
  );

  const parent = jsxElements.find(
    (el) => el.getOpeningElement().getStartLineNumber() === parentLine
  );

  if (!parent) {
    throw new Error(`No parent JSX element found at line ${parentLine}`);
  }

  const children = parent.getJsxChildren();

  // Filter to meaningful children (skip whitespace-only text)
  const meaningful = children.filter((child) => {
    if (child.isKind(SyntaxKind.JsxText)) {
      return child.getText().trim().length > 0;
    }
    return true;
  });

  if (fromIndex < 0 || fromIndex >= meaningful.length) {
    throw new Error(`fromIndex ${fromIndex} out of bounds`);
  }
  if (toIndex < 0 || toIndex >= meaningful.length) {
    throw new Error(`toIndex ${toIndex} out of bounds`);
  }

  // Get the text of the element being moved
  const movingElement = meaningful[fromIndex];
  const movingText = movingElement.getText();

  // Get the text of the element at the target position
  const targetElement = meaningful[toIndex];

  // Perform the swap by replacing text
  const fullText = sourceFile.getFullText();
  const movingStart = movingElement.getStart();
  const movingEnd = movingElement.getEnd();
  const targetStart = targetElement.getStart();
  const targetEnd = targetElement.getEnd();
  const targetText = targetElement.getText();

  // Build new text with swapped elements
  let newText: string;
  if (movingStart < targetStart) {
    newText =
      fullText.substring(0, movingStart) +
      targetText +
      fullText.substring(movingEnd, targetStart) +
      movingText +
      fullText.substring(targetEnd);
  } else {
    newText =
      fullText.substring(0, targetStart) +
      movingText +
      fullText.substring(targetEnd, movingStart) +
      targetText +
      fullText.substring(movingEnd);
  }

  sourceFile.replaceWithText(newText);
}
