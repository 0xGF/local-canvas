import { type SourceFile, SyntaxKind } from "ts-morph";

/**
 * Move a JSX child within its parent.
 *
 * Semantics: remove the element at `fromIndex`, then re-insert so that it ends
 * up at `toIndex` in the resulting list.
 *   - `fromIndex` is into the full meaningful-child list (length N).
 *   - `toIndex` is into the post-removal list (length N-1). `toIndex === N-1`
 *     means "append to the end".
 *
 * This matches the client's drag-insertion-line UX: the visual insertion point
 * is always computed against siblings minus the element being dragged. The
 * previous implementation did a 2-element swap, which caused far-away siblings
 * to ride along when the cursor target wasn't adjacent to the moving element.
 */
export function reorderChildren(
  sourceFile: SourceFile,
  parentLine: number,
  fromIndex: number,
  toIndex: number
): void {
  const jsxElements = sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement);
  const parent = jsxElements.find(
    (el) => el.getOpeningElement().getStartLineNumber() === parentLine
  );
  if (!parent) {
    throw new Error(`No parent JSX element found at line ${parentLine}`);
  }

  const children = parent.getJsxChildren();
  const meaningful = children.filter((child) => {
    if (child.isKind(SyntaxKind.JsxText)) {
      return child.getText().trim().length > 0;
    }
    return true;
  });

  if (fromIndex < 0 || fromIndex >= meaningful.length) {
    throw new Error(`fromIndex ${fromIndex} out of bounds`);
  }
  if (toIndex < 0 || toIndex > meaningful.length - 1) {
    throw new Error(`toIndex ${toIndex} out of bounds`);
  }
  if (fromIndex === toIndex) return;
  // Dragging within the same slot — no-op. (toIndex is post-removal, so when
  // the element is last and cursor lands at the end, toIndex === fromIndex too.)

  const moving = meaningful[fromIndex];
  const movingText = moving.getText();
  const movingStart = moving.getStart();
  const movingEnd = moving.getEnd();

  // Remaining children after the moving one is removed (in original order).
  const remaining = meaningful.filter((_, i) => i !== fromIndex);

  // Where to splice the moving element's text back in:
  //   - toIndex < remaining.length → just before remaining[toIndex]
  //   - toIndex === remaining.length → after the last remaining element (append)
  let insertPos: number;
  if (toIndex < remaining.length) {
    insertPos = remaining[toIndex].getStart();
  } else {
    insertPos = remaining[remaining.length - 1].getEnd();
  }

  const fullText = sourceFile.getFullText();

  // Two cases based on whether we're moving forward (insertPos after the
  // original location) or backward (insertPos before it). We can't just do
  // "delete then insert" because the offsets shift; build the new string
  // in one pass instead.
  let newText: string;
  if (insertPos <= movingStart) {
    // Backward move (up the list).
    newText =
      fullText.substring(0, insertPos) +
      movingText +
      fullText.substring(insertPos, movingStart) +
      fullText.substring(movingEnd);
  } else if (insertPos >= movingEnd) {
    // Forward move (down the list).
    newText =
      fullText.substring(0, movingStart) +
      fullText.substring(movingEnd, insertPos) +
      movingText +
      fullText.substring(insertPos);
  } else {
    throw new Error(
      `insertPos ${insertPos} is inside moving element range [${movingStart}, ${movingEnd}]`
    );
  }

  sourceFile.replaceWithText(newText);
}
