export interface SourceLocation {
  filePath: string;
  line: number;
  column?: number;
}

export interface MappedElement {
  domElement: HTMLElement;
  source: SourceLocation;
  tagName: string;
  className: string;
  isComponent: boolean;
}
