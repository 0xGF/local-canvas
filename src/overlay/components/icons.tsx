import React from "react";
import { HugeiconsIcon, type HugeiconsProps } from "@hugeicons/react";
import {
  // Panel header
  Cancel01Icon,
  CodeIcon,
  Settings01Icon,

  // Text alignment
  TextAlignLeftIcon,
  TextAlignCenterIcon,
  TextAlignRightIcon,
  TextAlignJustifyCenterIcon,

  // Vertical alignment (flex cross-axis)
  AlignVerticalJustifyStartIcon,
  AlignVerticalCenterIcon,
  AlignVerticalDistributeEndIcon,

  // Flex direction arrows
  MoveRightIcon,
  MoveBottomIcon,
  MoveLeftIcon,
  MoveTopIcon,

  // Layout display modes
  SquareIcon,
  LayoutThreeColumnIcon,
  GridIcon,
  ViewOffIcon,

  // Chevrons
  ArrowDown01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  ArrowLeft01Icon,

  // Actions
  Add01Icon,
  MinusSignIcon,

  // Toolbar
  Cursor02Icon,
  MoveIcon,
  WavingHand01Icon,
  PencilIcon,
  Layers01Icon,
  TextIcon,
  PaintBrush01Icon,
  BorderAll01Icon,
  CloudSlowWindIcon,
  Search01Icon,
  Undo02Icon,
  Redo02Icon,
  FloppyDiskIcon,
  RotateLeft01Icon,
  PanelRightIcon,
  Minimize02Icon,
  SaturnIcon,
  LayoutGridIcon,
  Target01Icon,
  ShapesIcon,
  Tick01Icon,
  Alert01Icon,
  FileScriptIcon,
  SlidersHorizontalIcon,
  CircleIcon,
  SmartPhone01Icon,
  Tablet01Icon,
  ComputerIcon,
  Maximize02Icon,
  Delete02Icon,
  Copy01Icon,
  FilePasteIcon,
  TextWrapIcon,
  InformationCircleIcon,
  SparklesIcon,
  AddCircleIcon,
  MessageAdd01Icon,
  MessageMultiple01Icon,
  PauseIcon,
  PlayIcon,
  MoreHorizontalIcon,
  Sun01Icon,
  MoonIcon,

  // Layers panel row icons
  Image01Icon,
  Heading01Icon,
  ListViewIcon,
  CursorPointer02Icon,
  FirstBracketIcon,
  Link01Icon,

  // Added for files previously importing lucide-react directly
  AlertCircleIcon,
  Loading03Icon,
  Clock01Icon,
  MailSend01Icon,
  RectangularIcon,
  InputTextIcon,
  ToggleOffIcon,
  CreditCardIcon,
  Tag01Icon,
  UserCircleIcon,
} from "@hugeicons/core-free-icons";

// Re-export HugeIcons icons under the same names the codebase used for
// lucide-react. Each export is a small forwardRef wrapper so existing call
// sites like `<Pencil size={14} />` keep working unchanged.
// The wrapper renders a <span> around the SVG — typed against span-level
// DOM props so click handlers/refs/style match the outer element, plus the
// HugeIcons-specific appearance knobs (size, strokeWidth, color).
type IconProps = React.HTMLAttributes<HTMLSpanElement> & {
  size?: HugeiconsProps["size"];
  strokeWidth?: HugeiconsProps["strokeWidth"];
  color?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const make = (icon: any, displayName: string) => {
  // HugeIcons' free-pack paths sit inconsistently inside their 24×24 viewBox
  // (some icons are flush, some have 1–2px of whitespace). That makes them
  // visually hop around the centre-line of toolbar buttons. To normalise:
  //
  //   1. Render the SVG inside a fixed-size inline-flex span so every icon
  //      occupies exactly the requested footprint (no shrink, no drift).
  //   2. Force `display: block` on the SVG so no baseline whitespace leaks
  //      into the flex parent.
  //   3. Default strokeWidth to 2 — lucide's weight, which the rest of the
  //      UI was designed against.
  const Component = React.forwardRef<HTMLSpanElement, IconProps>(
    (
      {
        style,
        className,
        size = 16,
        strokeWidth,
        color,
        ...rest
      },
      ref
    ) => {
      const dim = typeof size === "number" ? size : parseInt(String(size), 10) || 16;
      return (
        <span
          ref={ref}
          className={className}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: dim,
            height: dim,
            flexShrink: 0,
            lineHeight: 0,
            color,
            ...style,
          }}
          {...rest}
        >
          <HugeiconsIcon
            icon={icon}
            size={dim}
            strokeWidth={strokeWidth ?? 2}
            style={{ display: "block" }}
            aria-hidden
          />
        </span>
      );
    }
  );
  Component.displayName = displayName;
  return Component;
};

// Panel header
export const X = make(Cancel01Icon, "X");
export const Code = make(CodeIcon, "Code");
export const Settings = make(Settings01Icon, "Settings");

// Text alignment
export const AlignLeft = make(TextAlignLeftIcon, "AlignLeft");
export const AlignCenter = make(TextAlignCenterIcon, "AlignCenter");
export const AlignRight = make(TextAlignRightIcon, "AlignRight");
export const AlignJustify = make(TextAlignJustifyCenterIcon, "AlignJustify");

// Vertical alignment
export const AlignStartVertical = make(AlignVerticalJustifyStartIcon, "AlignStartVertical");
export const AlignCenterVertical = make(AlignVerticalCenterIcon, "AlignCenterVertical");
export const AlignEndVertical = make(AlignVerticalDistributeEndIcon, "AlignEndVertical");

// Flex direction arrows
export const MoveRight = make(MoveRightIcon, "MoveRight");
export const MoveDown = make(MoveBottomIcon, "MoveDown");
export const MoveLeft = make(MoveLeftIcon, "MoveLeft");
export const MoveUp = make(MoveTopIcon, "MoveUp");

// Layout display modes
export const Square = make(SquareIcon, "Square");
export const Columns3 = make(LayoutThreeColumnIcon, "Columns3");
export const Grid3x3 = make(GridIcon, "Grid3x3");
export const EyeOff = make(ViewOffIcon, "EyeOff");

// Chevrons
export const ChevronDown = make(ArrowDown01Icon, "ChevronDown");
export const ChevronRight = make(ArrowRight01Icon, "ChevronRight");
export const ChevronUp = make(ArrowUp01Icon, "ChevronUp");

// Actions
export const Plus = make(Add01Icon, "Plus");
export const Minus = make(MinusSignIcon, "Minus");

// Toolbar
export const Pointer = make(Cursor02Icon, "Pointer");
export const Move = make(MoveIcon, "Move");
export const Hand = make(WavingHand01Icon, "Hand");
export const Pencil = make(PencilIcon, "Pencil");
export const Layers = make(Layers01Icon, "Layers");
export const Type = make(TextIcon, "Type");
export const Paintbucket = make(PaintBrush01Icon, "Paintbucket");
export const BorderAll = make(BorderAll01Icon, "BorderAll");
export const Shadow = make(CloudSlowWindIcon, "Shadow");
export const Search = make(Search01Icon, "Search");
export const Undo = make(Undo02Icon, "Undo");
export const Redo = make(Redo02Icon, "Redo");
export const Save = make(FloppyDiskIcon, "Save");
export const Reset = make(RotateLeft01Icon, "Reset");
export const PanelRight = make(PanelRightIcon, "PanelRight");
export const Minimize = make(Minimize02Icon, "Minimize");
export const SpacingIcon = make(SaturnIcon, "SpacingIcon");
export const LayoutIcon = make(LayoutGridIcon, "LayoutIcon");
export const Crosshair = make(Target01Icon, "Crosshair");
export const Component = make(ShapesIcon, "Component");
export const Check = make(Tick01Icon, "Check");
export const AlertTriangle = make(Alert01Icon, "AlertTriangle");
export const FileCode = make(FileScriptIcon, "FileCode");
export const SlidersHorizontal = make(SlidersHorizontalIcon, "SlidersHorizontal");
export const CircleDot = make(CircleIcon, "CircleDot");
export const Smartphone = make(SmartPhone01Icon, "Smartphone");
export const Tablet = make(Tablet01Icon, "Tablet");
export const Monitor = make(ComputerIcon, "Monitor");
export const Maximize2 = make(Maximize02Icon, "Maximize2");
export const Trash2 = make(Delete02Icon, "Trash2");
export const Copy = make(Copy01Icon, "Copy");
export const ClipboardPaste = make(FilePasteIcon, "ClipboardPaste");
export const ArrowUp = make(ArrowUp01Icon, "ArrowUp");
export const ArrowDown = make(ArrowDown01Icon, "ArrowDown");
export const ArrowLeft = make(ArrowLeft01Icon, "ArrowLeft");
export const WrapText = make(TextWrapIcon, "WrapText");
export const Info = make(InformationCircleIcon, "Info");
export const Sparkles = make(SparklesIcon, "Sparkles");
export const PlusCircle = make(AddCircleIcon, "PlusCircle");
export const MessageSquarePlus = make(MessageAdd01Icon, "MessageSquarePlus");
export const MessagesSquare = make(MessageMultiple01Icon, "MessagesSquare");
export const Pause = make(PauseIcon, "Pause");
export const Play = make(PlayIcon, "Play");
export const MoreHorizontal = make(MoreHorizontalIcon, "MoreHorizontal");
export const Sun = make(Sun01Icon, "Sun");
export const Moon = make(MoonIcon, "Moon");

// Layers panel row icons
export const ImageIcon = make(Image01Icon, "ImageIcon");
export const Heading1 = make(Heading01Icon, "Heading1");
export const ListIcon = make(ListViewIcon, "ListIcon");
export const MousePointerClick = make(CursorPointer02Icon, "MousePointerClick");
export const Braces = make(FirstBracketIcon, "Braces");
export const LinkIcon = make(Link01Icon, "LinkIcon");

// Previously imported directly from lucide-react — now routed through the barrel
export const AlertCircle = make(AlertCircleIcon, "AlertCircle");
export const Loader2 = make(Loading03Icon, "Loader2");
export const Clock = make(Clock01Icon, "Clock");
export const Send = make(MailSend01Icon, "Send");
export const RectangleHorizontal = make(RectangularIcon, "RectangleHorizontal");
export const FormInput = make(InputTextIcon, "FormInput");
export const ToggleLeft = make(ToggleOffIcon, "ToggleLeft");
export const CreditCard = make(CreditCardIcon, "CreditCard");
export const SeparatorHorizontal = make(MinusSignIcon, "SeparatorHorizontal");
export const Tag = make(Tag01Icon, "Tag");
export const CircleUser = make(UserCircleIcon, "CircleUser");
