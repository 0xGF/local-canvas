import React, { useCallback } from "react";
import {
  X,
  RectangleHorizontal,
  Type,
  FormInput,
  ToggleLeft,
  ImageIcon,
  ListIcon,
  CreditCard,
  SeparatorHorizontal,
  Tag,
  CircleUser,
} from "./icons.js";
import { Button } from "./ui/button.js";
import { Label } from "./ui/label.js";
import { Separator } from "./ui/separator.js";
import { useEditorStore } from "../stores/editor-store.js";
import { useWebSocket } from "../hooks/useWebSocket.js";

interface PaletteItem {
  name: string;
  label: string;
  icon: React.ReactNode;
  defaultProps?: Record<string, string>;
}

const SHADCN_COMPONENTS: PaletteItem[] = [
  {
    name: "Button",
    label: "Button",
    icon: <RectangleHorizontal className="h-4 w-4" />,
    defaultProps: { variant: "default" },
  },
  {
    name: "Input",
    label: "Input",
    icon: <FormInput className="h-4 w-4" />,
    defaultProps: { placeholder: "Enter text..." },
  },
  {
    name: "Label",
    label: "Label",
    icon: <Type className="h-4 w-4" />,
  },
  {
    name: "Badge",
    label: "Badge",
    icon: <Tag className="h-4 w-4" />,
    defaultProps: { variant: "default" },
  },
  {
    name: "Card",
    label: "Card",
    icon: <CreditCard className="h-4 w-4" />,
  },
  {
    name: "Separator",
    label: "Separator",
    icon: <SeparatorHorizontal className="h-4 w-4" />,
  },
  {
    name: "Switch",
    label: "Switch",
    icon: <ToggleLeft className="h-4 w-4" />,
  },
  {
    name: "Textarea",
    label: "Textarea",
    icon: <ListIcon className="h-4 w-4" />,
    defaultProps: { placeholder: "Enter text..." },
  },
  {
    name: "Avatar",
    label: "Avatar",
    icon: <CircleUser className="h-4 w-4" />,
  },
  {
    name: "Skeleton",
    label: "Skeleton",
    icon: <ImageIcon className="h-4 w-4" />,
  },
];

const HTML_ELEMENTS: PaletteItem[] = [
  { name: "div", label: "Div", icon: <RectangleHorizontal className="h-4 w-4" /> },
  { name: "p", label: "Paragraph", icon: <Type className="h-4 w-4" /> },
  { name: "span", label: "Span", icon: <Type className="h-4 w-4" /> },
  { name: "h1", label: "Heading 1", icon: <Type className="h-4 w-4" /> },
  { name: "h2", label: "Heading 2", icon: <Type className="h-4 w-4" /> },
  { name: "h3", label: "Heading 3", icon: <Type className="h-4 w-4" /> },
  { name: "img", label: "Image", icon: <ImageIcon className="h-4 w-4" /> },
];

export function ComponentPalette() {
  const paletteOpen = useEditorStore((s) => s.paletteOpen);
  const togglePalette = useEditorStore((s) => s.togglePalette);
  const selectedElement = useEditorStore((s) => s.selectedElement);
  const { sendMutation } = useWebSocket();

  const handleInsert = useCallback(
    async (item: PaletteItem) => {
      if (!selectedElement?.source) return;

      await sendMutation({
        type: "insert",
        source: selectedElement.source,
        position: "child",
        componentName: item.name,
        props: item.defaultProps,
      });
    },
    [selectedElement, sendMutation]
  );

  if (!paletteOpen) return null;

  return (
    <div
      style={{ pointerEvents: "auto" }}
      data-canvas-overlay="true"
      className="fixed top-4 left-4 w-56 max-h-[calc(100vh-8rem)] bg-canvas-bg/95 backdrop-blur-md border border-canvas-border rounded-xl shadow-2xl overflow-hidden flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-canvas-border">
        <span className="text-xs font-medium text-canvas-fg">Components</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={togglePalette}
          className="h-5 w-5"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      {/* Component list */}
      <div className="overflow-y-auto flex-1 p-2 space-y-3">
        {/* shadcn/ui */}
        <div>
          <Label className="text-[10px] uppercase tracking-wider mb-1 block px-1">
            shadcn/ui
          </Label>
          <div className="space-y-0.5">
            {SHADCN_COMPONENTS.map((item) => (
              <button
                key={item.name}
                onClick={() => handleInsert(item)}
                disabled={!selectedElement}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-canvas-fg hover:bg-canvas-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        <Separator />

        {/* HTML elements */}
        <div>
          <Label className="text-[10px] uppercase tracking-wider mb-1 block px-1">
            HTML
          </Label>
          <div className="space-y-0.5">
            {HTML_ELEMENTS.map((item) => (
              <button
                key={item.name}
                onClick={() => handleInsert(item)}
                disabled={!selectedElement}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-canvas-fg hover:bg-canvas-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {!selectedElement && (
        <div className="px-3 py-2 border-t border-canvas-border">
          <p className="text-[10px] text-canvas-muted-fg">
            Select an element to insert components into it.
          </p>
        </div>
      )}
    </div>
  );
}
