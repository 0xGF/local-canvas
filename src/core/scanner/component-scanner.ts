import { Project, Node, SyntaxKind, Type } from "ts-morph";
import { resolve } from "path";
import { readdirSync, statSync, existsSync } from "fs";
import type { ScannedComponent, ScannedProp, ScanResult } from "./types.js";

export class ComponentScanner {
  private project: Project;
  private projectRoot: string;
  private cache: ScanResult | null = null;

  constructor(projectRoot: string) {
    this.projectRoot = resolve(projectRoot);

    // Try tsconfig.app.json first (some projects use project references),
    // then tsconfig.json, then fall back to no tsconfig
    const tsconfigCandidates = [
      resolve(projectRoot, "tsconfig.app.json"),
      resolve(projectRoot, "tsconfig.json"),
    ];

    let projectOpts: any = { skipAddingFilesFromTsConfig: true };
    for (const candidate of tsconfigCandidates) {
      if (existsSync(candidate)) {
        projectOpts.tsConfigFilePath = candidate;
        break;
      }
    }

    this.project = new Project(projectOpts);
  }

  scan(): ScanResult {
    // Simple cache — rescan each time for now
    const srcDir = resolve(this.projectRoot, "src");
    const files = this.collectFiles(srcDir);
    const components: ScannedComponent[] = [];

    for (const filePath of files) {
      try {
        let sourceFile = this.project.getSourceFile(filePath);
        if (!sourceFile) {
          sourceFile = this.project.addSourceFileAtPath(filePath);
        } else {
          sourceFile.refreshFromFileSystemSync();
        }

        // Find exported function declarations
        for (const fn of sourceFile.getFunctions()) {
          if (!fn.isExported()) continue;
          const name = fn.getName();
          if (!name || !isUpperCase(name[0])) continue;
          if (!this.looksLikeComponent(fn)) continue;

          components.push({
            name,
            filePath: this.relativePath(filePath),
            exportType: fn.isDefaultExport() ? "default" : "named",
            props: this.extractProps(fn.getParameters()[0]),
          });
        }

        // Find exported arrow function variable declarations
        for (const varStmt of sourceFile.getVariableStatements()) {
          if (!varStmt.isExported()) continue;
          for (const decl of varStmt.getDeclarations()) {
            const name = decl.getName();
            if (!isUpperCase(name[0])) continue;

            const init = decl.getInitializer();
            if (!init) continue;

            // Arrow function or function expression
            if (Node.isArrowFunction(init) || Node.isFunctionExpression(init)) {
              components.push({
                name,
                filePath: this.relativePath(filePath),
                exportType: varStmt.hasDefaultKeyword() ? "default" : "named",
                props: this.extractProps(init.getParameters()[0]),
              });
            }

            // React.forwardRef or React.memo wrapping
            if (Node.isCallExpression(init)) {
              const expr = init.getExpression();
              const text = expr.getText();
              if (text.includes("forwardRef") || text.includes("memo")) {
                const args = init.getArguments();
                if (args.length > 0) {
                  const inner = args[0];
                  if (Node.isArrowFunction(inner) || Node.isFunctionExpression(inner)) {
                    components.push({
                      name,
                      filePath: this.relativePath(filePath),
                      exportType: "named",
                      props: this.extractProps(inner.getParameters()[0]),
                    });
                  }
                }
              }
            }
          }
        }
      } catch {
        // Skip files that fail to parse
      }
    }

    this.cache = { components, fileCount: files.length };
    return this.cache;
  }

  private looksLikeComponent(fn: any): boolean {
    // Check if function body contains JSX
    try {
      const body = fn.getBody();
      if (!body) return false;
      const text = body.getText();
      return text.includes("<") && (text.includes("/>") || text.includes("</"));
    } catch {
      return false;
    }
  }

  private extractProps(param: any): ScannedProp[] {
    if (!param) return [];

    const props: ScannedProp[] = [];

    try {
      const typeNode = param.getTypeNode();
      let type: Type | undefined;

      if (typeNode) {
        type = typeNode.getType();
      } else {
        // Try to infer type from destructuring
        type = param.getType();
      }

      if (!type) return [];

      const properties = type.getProperties();
      for (const prop of properties) {
        const propType = prop.getTypeAtLocation(param);
        const declarations = prop.getDeclarations();
        const isOptional = prop.isOptional();

        // Extract default value from destructuring
        let defaultValue: string | undefined;
        if (Node.isObjectBindingPattern(param.compilerNode?.name)) {
          const bindingPattern = param.getNameNode();
          if (bindingPattern && Node.isObjectBindingPattern(bindingPattern)) {
            for (const element of bindingPattern.getElements()) {
              if (element.getName() === prop.getName()) {
                const init = element.getInitializer();
                if (init) defaultValue = init.getText();
              }
            }
          }
        }

        props.push({
          name: prop.getName(),
          type: this.mapType(propType),
          required: !isOptional,
          defaultValue,
          enumValues: this.getEnumValues(propType),
        });
      }
    } catch {
      // Fallback: no props extracted
    }

    return props;
  }

  private mapType(type: Type): ScannedProp["type"] {
    if (type.isBoolean() || type.isBooleanLiteral()) return "boolean";
    if (type.isString() || type.isStringLiteral()) return "string";
    if (type.isNumber() || type.isNumberLiteral()) return "number";
    if (type.isUnion()) {
      const types = type.getUnionTypes();
      // Check if all are literals (enum-like)
      if (types.every(t => t.isStringLiteral() || t.isNumberLiteral() || t.isBooleanLiteral())) {
        return "enum";
      }
      // Check for boolean union (true | false)
      if (types.length === 2 && types.every(t => t.isBooleanLiteral())) {
        return "boolean";
      }
      return "unknown";
    }
    if (type.getCallSignatures().length > 0) return "function";
    if (type.isObject()) return "object";
    return "unknown";
  }

  private getEnumValues(type: Type): string[] | undefined {
    if (!type.isUnion()) return undefined;
    const types = type.getUnionTypes();
    const values: string[] = [];
    for (const t of types) {
      const literal = t.getLiteralValue();
      if (literal !== undefined) {
        values.push(String(literal));
      }
    }
    return values.length > 0 ? values : undefined;
  }

  private collectFiles(dir: string): string[] {
    const files: string[] = [];
    try {
      for (const entry of readdirSync(dir)) {
        if (entry.startsWith(".") || entry === "node_modules") continue;
        const full = resolve(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) {
          files.push(...this.collectFiles(full));
        } else if (/\.[jt]sx?$/.test(entry) && !entry.endsWith(".d.ts") && !entry.includes(".test.") && !entry.includes(".spec.")) {
          files.push(full);
        }
      }
    } catch {
      // Dir doesn't exist or can't be read
    }
    return files;
  }

  private relativePath(filePath: string): string {
    return filePath.replace(this.projectRoot + "/", "");
  }
}

function isUpperCase(ch: string): boolean {
  return ch === ch.toUpperCase() && ch !== ch.toLowerCase();
}
