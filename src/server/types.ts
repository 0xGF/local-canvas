import type { SourceLocation } from "../core/source-map/types.js";

export type Mutation =
  | {
      type: "modify-class";
      source: SourceLocation;
      add?: string[];
      remove?: string[];
    }
  | {
      type: "modify-style";
      source: SourceLocation;
      property: string;
      value: string;
    }
  | {
      type: "reorder";
      source: SourceLocation;
      fromIndex: number;
      toIndex: number;
    }
  | {
      type: "insert";
      source: SourceLocation;
      position: "before" | "after" | "child";
      componentName: string;
      props?: Record<string, string>;
    }
  | {
      type: "delete";
      source: SourceLocation;
    }
  | {
      type: "duplicate-element";
      source: SourceLocation;
    }
  | {
      type: "modify-text";
      source: SourceLocation;
      newText: string;
    }
  | {
      type: "ai-command";
      source: SourceLocation;
      prompt: string;
      context: string;
    };

export interface MutationResult {
  success: boolean;
  error?: string;
  diff?: string;
  filesModified: string[];
}

export type WSClientMessage =
  | { type: "mutation"; id: string; mutation: Mutation }
  | { type: "undo" }
  | { type: "redo" }
  | {
      type: "ai-command";
      prompt: string;
      elementContext: ElementContext;
    }
  | { type: "get-completions"; filePath: string; prefix: string }
  | { type: "scan-components" }
  | { type: "save" };

export type WSServerMessage =
  | { type: "mutation-result"; id: string; result: MutationResult }
  | { type: "ai-stream"; chunk: string; done: boolean }
  | { type: "completions"; items: string[] }
  | { type: "error"; message: string }
  | { type: "components-scanned"; components: import("../core/scanner/types.js").ScannedComponent[]; fileCount: number };

export interface ElementContext {
  filePath: string;
  line: number;
  column?: number;
  tagName: string;
  className: string;
  innerHTML?: string;
  parentTag?: string;
  siblingTags?: string[];
}
