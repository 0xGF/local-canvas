import { type SourceFile, SyntaxKind } from "ts-morph";

export function insertComponent(
  sourceFile: SourceFile,
  line: number,
  position: "before" | "after" | "child",
  componentName: string,
  props?: Record<string, string>
): void {
  // Build the JSX string
  const propsStr = props
    ? " " +
      Object.entries(props)
        .map(([key, value]) => `${key}="${value}"`)
        .join(" ")
    : "";

  const jsxTag = `<${componentName}${propsStr} />`;

  // Find the target JSX element at the line
  const allElements = [
    ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement),
    ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
  ];

  const target = allElements.find((el) => {
    const startLine =
      el.isKind(SyntaxKind.JsxElement)
        ? el.getOpeningElement().getStartLineNumber()
        : el.getStartLineNumber();
    return startLine === line;
  });

  if (!target) {
    throw new Error(`No JSX element found at line ${line}`);
  }

  // Determine indentation from target
  const targetLine = sourceFile.getFullText().split("\n")[line - 1] || "";
  const indent = targetLine.match(/^(\s*)/)?.[1] || "";

  const fullText = sourceFile.getFullText();

  switch (position) {
    case "before": {
      const start = target.getStart();
      const newText =
        fullText.substring(0, start) +
        `${jsxTag}\n${indent}` +
        fullText.substring(start);
      sourceFile.replaceWithText(newText);
      break;
    }

    case "after": {
      const end = target.getEnd();
      const newText =
        fullText.substring(0, end) +
        `\n${indent}${jsxTag}` +
        fullText.substring(end);
      sourceFile.replaceWithText(newText);
      break;
    }

    case "child": {
      if (target.isKind(SyntaxKind.JsxSelfClosingElement)) {
        // Convert self-closing to element with child
        const tagName = target.getTagNameNode().getText();
        const attrs = target
          .getAttributes()
          .map((a) => a.getText())
          .join(" ");
        const attrsStr = attrs ? ` ${attrs}` : "";
        const childIndent = indent + "  ";
        const replacement = `<${tagName}${attrsStr}>\n${childIndent}${jsxTag}\n${indent}</${tagName}>`;
        target.replaceWithText(replacement);
      } else if (target.isKind(SyntaxKind.JsxElement)) {
        const closingTag = target.getClosingElement();
        const insertPos = closingTag.getStart();
        const childIndent = indent + "  ";
        const newText =
          fullText.substring(0, insertPos) +
          `${childIndent}${jsxTag}\n${indent}` +
          fullText.substring(insertPos);
        sourceFile.replaceWithText(newText);
      }
      break;
    }
  }

  // Add import if needed
  ensureImport(sourceFile, componentName);
}

function ensureImport(sourceFile: SourceFile, componentName: string): void {
  const imports = sourceFile.getImportDeclarations();

  // Check if already imported
  for (const imp of imports) {
    const namedImports = imp.getNamedImports();
    if (namedImports.some((n) => n.getName() === componentName)) {
      return; // Already imported
    }
  }

  // Try to find the component in common locations
  const importMap: Record<string, string> = {
    Button: "@/components/ui/button",
    Card: "@/components/ui/card",
    CardHeader: "@/components/ui/card",
    CardTitle: "@/components/ui/card",
    CardDescription: "@/components/ui/card",
    CardContent: "@/components/ui/card",
    CardFooter: "@/components/ui/card",
    Input: "@/components/ui/input",
    Label: "@/components/ui/label",
    Badge: "@/components/ui/badge",
    Avatar: "@/components/ui/avatar",
    AvatarImage: "@/components/ui/avatar",
    AvatarFallback: "@/components/ui/avatar",
    Separator: "@/components/ui/separator",
    Skeleton: "@/components/ui/skeleton",
    Switch: "@/components/ui/switch",
    Textarea: "@/components/ui/textarea",
    Select: "@/components/ui/select",
    Checkbox: "@/components/ui/checkbox",
    Dialog: "@/components/ui/dialog",
    Sheet: "@/components/ui/sheet",
  };

  const importPath = importMap[componentName];
  if (!importPath) return;

  // Check if an import from this path exists — add to it
  const existingImport = imports.find(
    (imp) =>
      imp.getModuleSpecifierValue() === importPath
  );

  if (existingImport) {
    existingImport.addNamedImport(componentName);
  } else {
    sourceFile.addImportDeclaration({
      moduleSpecifier: importPath,
      namedImports: [componentName],
    });
  }
}
