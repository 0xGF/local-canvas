import { Project } from "ts-morph";
import { resolve } from "path";
import { readFileSync, writeFileSync } from "fs";
import type { Mutation, MutationResult } from "../../server/types.js";
import { modifyClassName } from "./class-modifier.js";
import { reorderChildren } from "./reorder.js";
import { insertComponent } from "./component-inserter.js";
import { parseClass } from "../tailwind/parser.js";

interface FileSnapshot {
  filePath: string;
  content: string;
}

export class MutationWriter {
  private project: Project;
  private projectRoot: string;
  private undoStack: FileSnapshot[][] = [];
  private redoStack: FileSnapshot[][] = [];

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.project = new Project({
      tsConfigFilePath: resolve(projectRoot, "tsconfig.json"),
      skipAddingFilesFromTsConfig: true,
    });
  }

  async batchApply(mutations: Mutation[]): Promise<MutationResult> {
    if (mutations.length === 0) {
      return { success: false, error: "No mutations", filesModified: [] };
    }
    if (mutations.length === 1) {
      return this.apply(mutations[0]);
    }

    // All mutations in a batch target the same file (grouped by caller)
    const filePath = resolve(this.projectRoot, mutations[0].source.filePath);
    const beforeContent = readFileSync(filePath, "utf-8");
    const snapshots: FileSnapshot[] = [{ filePath, content: beforeContent }];

    let sourceFile = this.project.getSourceFile(filePath);
    if (!sourceFile) {
      sourceFile = this.project.addSourceFileAtPath(filePath);
    } else {
      sourceFile.refreshFromFileSystemSync();
    }

    try {
      // Merge all modify-class mutations into a single add/remove set
      const allAdd: string[] = [];
      const allRemove: string[] = [];

      for (const mutation of mutations) {
        if (mutation.type === "modify-class") {
          if (mutation.remove) allRemove.push(...mutation.remove);
          if (mutation.add) allAdd.push(...mutation.add);
        }
      }

      // Remove items that appear in both add and remove (they cancel out),
      // and deduplicate: only keep the LAST add for a given utility key.
      // Uses Tailwind-aware parsing so md:text-red-500 and md:text-blue-600
      // share key "md:text" and the last one wins.
      const netRemove = allRemove.filter((r) => !allAdd.includes(r));
      const addMap = new Map<string, string>();
      for (const cls of allAdd) {
        const parsed = parseClass(cls);
        const key = (parsed.responsive ? parsed.responsive + ":" : "") + parsed.utility;
        addMap.set(key, cls);
      }
      const netAdd = [...addMap.values()].filter((a) => !allRemove.includes(a) || allAdd.lastIndexOf(a) > allRemove.lastIndexOf(a));

      if (netAdd.length > 0 || netRemove.length > 0) {
        modifyClassName(
          sourceFile,
          mutations[0].source.line,
          mutations[0].source.column,
          netAdd.length > 0 ? netAdd : undefined,
          netRemove.length > 0 ? netRemove : undefined
        );
      }

      sourceFile.saveSync();
      this.undoStack.push(snapshots);
      this.redoStack = [];

      const afterContent = readFileSync(filePath, "utf-8");
      const diff = generateSimpleDiff(beforeContent, afterContent);

      return { success: true, diff, filesModified: [mutations[0].source.filePath] };
    } catch (error) {
      writeFileSync(filePath, beforeContent);
      sourceFile.refreshFromFileSystemSync();
      return { success: false, error: String(error), filesModified: [] };
    }
  }

  async apply(mutation: Mutation): Promise<MutationResult> {
    const filePath = resolve(this.projectRoot, mutation.source.filePath);

    // Snapshot for undo
    const beforeContent = readFileSync(filePath, "utf-8");
    const snapshots: FileSnapshot[] = [
      { filePath, content: beforeContent },
    ];

    // Ensure file is loaded in project
    let sourceFile = this.project.getSourceFile(filePath);
    if (!sourceFile) {
      sourceFile = this.project.addSourceFileAtPath(filePath);
    } else {
      sourceFile.refreshFromFileSystemSync();
    }

    try {
      switch (mutation.type) {
        case "modify-class": {
          modifyClassName(
            sourceFile,
            mutation.source.line,
            mutation.source.column,
            mutation.add,
            mutation.remove
          );
          break;
        }

        case "reorder": {
          reorderChildren(
            sourceFile,
            mutation.source.line,
            mutation.fromIndex,
            mutation.toIndex
          );
          break;
        }

        case "insert": {
          insertComponent(
            sourceFile,
            mutation.source.line,
            mutation.position,
            mutation.componentName,
            mutation.props
          );
          break;
        }

        case "delete": {
          const { deleteElement } = await import("./jsx-modifier.js");
          deleteElement(sourceFile, mutation.source.line, mutation.source.column);
          break;
        }

        case "duplicate-element": {
          const { duplicateElement } = await import("./jsx-modifier.js");
          duplicateElement(sourceFile, mutation.source.line, mutation.source.column);
          break;
        }

        case "modify-text": {
          const { modifyText } = await import("./jsx-modifier.js");
          modifyText(
            sourceFile,
            mutation.source.line,
            mutation.source.column,
            mutation.newText
          );
          break;
        }

        default:
          return {
            success: false,
            error: `Unsupported mutation type: ${(mutation as Mutation).type}`,
            filesModified: [],
          };
      }

      sourceFile.saveSync();

      // Push to undo stack
      this.undoStack.push(snapshots);
      this.redoStack = [];

      // Generate diff
      const afterContent = readFileSync(filePath, "utf-8");
      const diff = generateSimpleDiff(beforeContent, afterContent);

      return {
        success: true,
        diff,
        filesModified: [mutation.source.filePath],
      };
    } catch (error) {
      // Restore original content on failure
      writeFileSync(filePath, beforeContent);
      sourceFile.refreshFromFileSystemSync();

      return {
        success: false,
        error: String(error),
        filesModified: [],
      };
    }
  }

  async undo(): Promise<MutationResult> {
    const snapshots = this.undoStack.pop();
    if (!snapshots) {
      return { success: false, error: "Nothing to undo", filesModified: [] };
    }

    const redoSnapshots: FileSnapshot[] = [];

    for (const snap of snapshots) {
      redoSnapshots.push({
        filePath: snap.filePath,
        content: readFileSync(snap.filePath, "utf-8"),
      });
      writeFileSync(snap.filePath, snap.content);

      const sourceFile = this.project.getSourceFile(snap.filePath);
      sourceFile?.refreshFromFileSystemSync();
    }

    this.redoStack.push(redoSnapshots);

    return {
      success: true,
      filesModified: snapshots.map((s) => s.filePath),
    };
  }

  async redo(): Promise<MutationResult> {
    const snapshots = this.redoStack.pop();
    if (!snapshots) {
      return { success: false, error: "Nothing to redo", filesModified: [] };
    }

    const undoSnapshots: FileSnapshot[] = [];

    for (const snap of snapshots) {
      undoSnapshots.push({
        filePath: snap.filePath,
        content: readFileSync(snap.filePath, "utf-8"),
      });
      writeFileSync(snap.filePath, snap.content);

      const sourceFile = this.project.getSourceFile(snap.filePath);
      sourceFile?.refreshFromFileSystemSync();
    }

    this.undoStack.push(undoSnapshots);

    return {
      success: true,
      filesModified: snapshots.map((s) => s.filePath),
    };
  }
}

function generateSimpleDiff(before: string, after: string): string {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const lines: string[] = [];

  const maxLen = Math.max(beforeLines.length, afterLines.length);
  for (let i = 0; i < maxLen; i++) {
    if (beforeLines[i] !== afterLines[i]) {
      if (beforeLines[i] !== undefined) lines.push(`- ${beforeLines[i]}`);
      if (afterLines[i] !== undefined) lines.push(`+ ${afterLines[i]}`);
    }
  }

  return lines.join("\n");
}
