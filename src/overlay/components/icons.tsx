import React from "react";
import { HugeiconsIcon, type HugeiconsProps } from "@hugeicons/react";
import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon";
import CodeIcon from "@hugeicons/core-free-icons/CodeIcon";
import Settings01Icon from "@hugeicons/core-free-icons/Settings01Icon";
import TextAlignLeftIcon from "@hugeicons/core-free-icons/TextAlignLeftIcon";
import TextAlignCenterIcon from "@hugeicons/core-free-icons/TextAlignCenterIcon";
import TextAlignRightIcon from "@hugeicons/core-free-icons/TextAlignRightIcon";
import TextAlignJustifyCenterIcon from "@hugeicons/core-free-icons/TextAlignJustifyCenterIcon";
import MoveRightIcon from "@hugeicons/core-free-icons/MoveRightIcon";
import MoveBottomIcon from "@hugeicons/core-free-icons/MoveBottomIcon";
import SquareIcon from "@hugeicons/core-free-icons/SquareIcon";
import LayoutThreeColumnIcon from "@hugeicons/core-free-icons/LayoutThreeColumnIcon";
import GridIcon from "@hugeicons/core-free-icons/GridIcon";
import ViewOffIcon from "@hugeicons/core-free-icons/ViewOffIcon";
import ArrowDown01Icon from "@hugeicons/core-free-icons/ArrowDown01Icon";
import ArrowRight01Icon from "@hugeicons/core-free-icons/ArrowRight01Icon";
import ArrowUp01Icon from "@hugeicons/core-free-icons/ArrowUp01Icon";
import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon";
import Add01Icon from "@hugeicons/core-free-icons/Add01Icon";
import MinusSignIcon from "@hugeicons/core-free-icons/MinusSignIcon";
import Cursor02Icon from "@hugeicons/core-free-icons/Cursor02Icon";
import MoveIcon from "@hugeicons/core-free-icons/MoveIcon";
import PencilIcon from "@hugeicons/core-free-icons/PencilIcon";
import Pen02Icon from "@hugeicons/core-free-icons/Pen02Icon";
import Layers01Icon from "@hugeicons/core-free-icons/Layers01Icon";
import TextIcon from "@hugeicons/core-free-icons/TextIcon";
import BorderAll01Icon from "@hugeicons/core-free-icons/BorderAll01Icon";
import CloudSlowWindIcon from "@hugeicons/core-free-icons/CloudSlowWindIcon";
import Search01Icon from "@hugeicons/core-free-icons/Search01Icon";
import Undo02Icon from "@hugeicons/core-free-icons/Undo02Icon";
import Redo02Icon from "@hugeicons/core-free-icons/Redo02Icon";
import FloppyDiskIcon from "@hugeicons/core-free-icons/FloppyDiskIcon";
import RotateLeft01Icon from "@hugeicons/core-free-icons/RotateLeft01Icon";
import Target01Icon from "@hugeicons/core-free-icons/Target01Icon";
import ShapesIcon from "@hugeicons/core-free-icons/ShapesIcon";
import Tick01Icon from "@hugeicons/core-free-icons/Tick01Icon";
import FileScriptIcon from "@hugeicons/core-free-icons/FileScriptIcon";
import SlidersHorizontalIcon from "@hugeicons/core-free-icons/SlidersHorizontalIcon";
import CircleIcon from "@hugeicons/core-free-icons/CircleIcon";
import Delete02Icon from "@hugeicons/core-free-icons/Delete02Icon";
import Copy01Icon from "@hugeicons/core-free-icons/Copy01Icon";
import FilePasteIcon from "@hugeicons/core-free-icons/FilePasteIcon";
import SparklesIcon from "@hugeicons/core-free-icons/SparklesIcon";
import MessageAdd01Icon from "@hugeicons/core-free-icons/MessageAdd01Icon";
import MessageMultiple01Icon from "@hugeicons/core-free-icons/MessageMultiple01Icon";
import PauseIcon from "@hugeicons/core-free-icons/PauseIcon";
import PlayIcon from "@hugeicons/core-free-icons/PlayIcon";
import Sun01Icon from "@hugeicons/core-free-icons/Sun01Icon";
import MoonIcon from "@hugeicons/core-free-icons/MoonIcon";
import Image01Icon from "@hugeicons/core-free-icons/Image01Icon";
import Heading01Icon from "@hugeicons/core-free-icons/Heading01Icon";
import ListViewIcon from "@hugeicons/core-free-icons/ListViewIcon";
import CursorPointer02Icon from "@hugeicons/core-free-icons/CursorPointer02Icon";
import FirstBracketIcon from "@hugeicons/core-free-icons/FirstBracketIcon";
import Link01Icon from "@hugeicons/core-free-icons/Link01Icon";
import AlertCircleIcon from "@hugeicons/core-free-icons/AlertCircleIcon";
import Loading03Icon from "@hugeicons/core-free-icons/Loading03Icon";
import Clock01Icon from "@hugeicons/core-free-icons/Clock01Icon";
import MailSend01Icon from "@hugeicons/core-free-icons/MailSend01Icon";
import RectangularIcon from "@hugeicons/core-free-icons/RectangularIcon";
import InputTextIcon from "@hugeicons/core-free-icons/InputTextIcon";
import ToggleOffIcon from "@hugeicons/core-free-icons/ToggleOffIcon";
import CreditCardIcon from "@hugeicons/core-free-icons/CreditCardIcon";
import Tag01Icon from "@hugeicons/core-free-icons/Tag01Icon";
import UserCircleIcon from "@hugeicons/core-free-icons/UserCircleIcon";
import ViewIcon from "@hugeicons/core-free-icons/ViewIcon";
import FlipHorizontalIcon from "@hugeicons/core-free-icons/FlipHorizontalIcon";
import FlipVerticalIcon from "@hugeicons/core-free-icons/FlipVerticalIcon";
import ColorPickerIcon from "@hugeicons/core-free-icons/ColorPickerIcon";

// Re-export HugeIcons icons via small forwardRef wrappers so call sites like
// `<Pencil size={14} />` keep working unchanged. The wrapper renders a <span>
// around the SVG — typed against span-level DOM props so click
// handlers/refs/style match the outer element, plus the HugeIcons-specific
// appearance knobs (size, strokeWidth, color).
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
  //   3. Default strokeWidth to 2 — the weight the rest of the UI was
  //      designed against.
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
export const X = /*#__PURE__*/ make(Cancel01Icon, "X");
export const Code = /*#__PURE__*/ make(CodeIcon, "Code");
export const Settings = /*#__PURE__*/ make(Settings01Icon, "Settings");

// Text alignment
export const AlignLeft = /*#__PURE__*/ make(TextAlignLeftIcon, "AlignLeft");
export const AlignCenter = /*#__PURE__*/ make(TextAlignCenterIcon, "AlignCenter");
export const AlignRight = /*#__PURE__*/ make(TextAlignRightIcon, "AlignRight");
export const AlignJustify = /*#__PURE__*/ make(TextAlignJustifyCenterIcon, "AlignJustify");

// Vertical alignment

// Flex direction arrows
export const MoveRight = /*#__PURE__*/ make(MoveRightIcon, "MoveRight");
export const MoveDown = /*#__PURE__*/ make(MoveBottomIcon, "MoveDown");

// Layout display modes
export const Square = /*#__PURE__*/ make(SquareIcon, "Square");
export const Columns3 = /*#__PURE__*/ make(LayoutThreeColumnIcon, "Columns3");
export const Grid3x3 = /*#__PURE__*/ make(GridIcon, "Grid3x3");
export const EyeOff = /*#__PURE__*/ make(ViewOffIcon, "EyeOff");

// Chevrons
export const ChevronDown = /*#__PURE__*/ make(ArrowDown01Icon, "ChevronDown");
export const ChevronRight = /*#__PURE__*/ make(ArrowRight01Icon, "ChevronRight");

// Actions
export const Plus = /*#__PURE__*/ make(Add01Icon, "Plus");
export const Minus = /*#__PURE__*/ make(MinusSignIcon, "Minus");

// Toolbar
export const Pointer = /*#__PURE__*/ make(Cursor02Icon, "Pointer");
export const Move = /*#__PURE__*/ make(MoveIcon, "Move");
export const Pencil = /*#__PURE__*/ make(PencilIcon, "Pencil");
export const Pen = /*#__PURE__*/ make(Pen02Icon, "Pen");
export const Layers = /*#__PURE__*/ make(Layers01Icon, "Layers");
export const Type = /*#__PURE__*/ make(TextIcon, "Type");
export const BorderAll = /*#__PURE__*/ make(BorderAll01Icon, "BorderAll");
export const Shadow = /*#__PURE__*/ make(CloudSlowWindIcon, "Shadow");
export const Search = /*#__PURE__*/ make(Search01Icon, "Search");
export const Undo = /*#__PURE__*/ make(Undo02Icon, "Undo");
export const Redo = /*#__PURE__*/ make(Redo02Icon, "Redo");
export const Save = /*#__PURE__*/ make(FloppyDiskIcon, "Save");
export const Reset = /*#__PURE__*/ make(RotateLeft01Icon, "Reset");
export const Crosshair = /*#__PURE__*/ make(Target01Icon, "Crosshair");
export const Component = /*#__PURE__*/ make(ShapesIcon, "Component");
export const Check = /*#__PURE__*/ make(Tick01Icon, "Check");
export const FileCode = /*#__PURE__*/ make(FileScriptIcon, "FileCode");
export const SlidersHorizontal = /*#__PURE__*/ make(SlidersHorizontalIcon, "SlidersHorizontal");
export const CircleDot = /*#__PURE__*/ make(CircleIcon, "CircleDot");
export const Trash2 = /*#__PURE__*/ make(Delete02Icon, "Trash2");
export const Copy = /*#__PURE__*/ make(Copy01Icon, "Copy");
export const ClipboardPaste = /*#__PURE__*/ make(FilePasteIcon, "ClipboardPaste");
export const ArrowUp = /*#__PURE__*/ make(ArrowUp01Icon, "ArrowUp");
export const ArrowDown = /*#__PURE__*/ make(ArrowDown01Icon, "ArrowDown");
export const ArrowLeft = /*#__PURE__*/ make(ArrowLeft01Icon, "ArrowLeft");
export const Sparkles = /*#__PURE__*/ make(SparklesIcon, "Sparkles");
export const MessageSquarePlus = /*#__PURE__*/ make(MessageAdd01Icon, "MessageSquarePlus");
export const MessagesSquare = /*#__PURE__*/ make(MessageMultiple01Icon, "MessagesSquare");
export const Pause = /*#__PURE__*/ make(PauseIcon, "Pause");
export const Play = /*#__PURE__*/ make(PlayIcon, "Play");
export const Sun = /*#__PURE__*/ make(Sun01Icon, "Sun");
export const Moon = /*#__PURE__*/ make(MoonIcon, "Moon");

// Layers panel row icons
export const ImageIcon = /*#__PURE__*/ make(Image01Icon, "ImageIcon");
export const Heading1 = /*#__PURE__*/ make(Heading01Icon, "Heading1");
export const ListIcon = /*#__PURE__*/ make(ListViewIcon, "ListIcon");
export const MousePointerClick = /*#__PURE__*/ make(CursorPointer02Icon, "MousePointerClick");
export const Braces = /*#__PURE__*/ make(FirstBracketIcon, "Braces");
export const LinkIcon = /*#__PURE__*/ make(Link01Icon, "LinkIcon");

export const AlertCircle = /*#__PURE__*/ make(AlertCircleIcon, "AlertCircle");
export const Loader2 = /*#__PURE__*/ make(Loading03Icon, "Loader2");
export const Clock = /*#__PURE__*/ make(Clock01Icon, "Clock");
export const Send = /*#__PURE__*/ make(MailSend01Icon, "Send");
export const RectangleHorizontal = /*#__PURE__*/ make(RectangularIcon, "RectangleHorizontal");
export const FormInput = /*#__PURE__*/ make(InputTextIcon, "FormInput");
export const ToggleLeft = /*#__PURE__*/ make(ToggleOffIcon, "ToggleLeft");
export const CreditCard = /*#__PURE__*/ make(CreditCardIcon, "CreditCard");
export const SeparatorHorizontal = /*#__PURE__*/ make(MinusSignIcon, "SeparatorHorizontal");
export const Tag = /*#__PURE__*/ make(Tag01Icon, "Tag");
export const CircleUser = /*#__PURE__*/ make(UserCircleIcon, "CircleUser");

// Picker / fill / outline / shadow / filter chrome
export const Eye = /*#__PURE__*/ make(ViewIcon, "Eye");
export const FlipHorizontal = /*#__PURE__*/ make(FlipHorizontalIcon, "FlipHorizontal");
export const FlipVertical = /*#__PURE__*/ make(FlipVerticalIcon, "FlipVertical");
export const Eyedropper = /*#__PURE__*/ make(ColorPickerIcon, "Eyedropper");
