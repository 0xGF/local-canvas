export interface ScannedProp {
  name: string;
  type: "string" | "number" | "boolean" | "enum" | "object" | "function" | "unknown";
  required: boolean;
  defaultValue?: string;
  enumValues?: string[];
}

export interface ScannedComponent {
  name: string;
  filePath: string;
  exportType: "named" | "default";
  props: ScannedProp[];
}

export interface ScanResult {
  components: ScannedComponent[];
  fileCount: number;
}
