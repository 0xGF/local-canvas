import type { SourceLocation } from "../../../core/source-map/types.js";

export interface SelectedElement {
  element: HTMLElement;
  source: SourceLocation | null;
  rect: DOMRect;
  className: string;
  tagName: string;
}

export interface SectionProps {
  get: (prefix: string) => string;
  set: (prefix: string, value: string, isExact?: boolean) => void;
  has: (cls: string) => boolean;
  toggleCls: (cls: string) => Promise<void>;
  sendPrefixed: (mutation: any) => Promise<any>;
  sel: SelectedElement;
  classes: string[];
}
