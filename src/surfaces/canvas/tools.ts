import {
  ArrowRight,
  Circle,
  Diamond,
  Eraser,
  Frame,
  Hand,
  Highlighter,
  Link2,
  Minus,
  MousePointer2,
  Pencil,
  Square,
  Type,
} from "lucide-react";

export const TOOLS = [
  "select",
  "hand",
  "rect",
  "ellipse",
  "diamond",
  "text",
  "frame",
  "line",
  "arrow",
  "connector",
  "draw",
  "highlighter",
  "eraser",
] as const;

export type Tool = (typeof TOOLS)[number];

export interface ToolSpec {
  id: Tool;
  label: string;
  icon: typeof Square;
  /** Single-key shortcut. */
  key: string;
  group: "pointer" | "shape" | "ink";
}

export const TOOL_SPECS: ToolSpec[] = [
  { id: "select", label: "Select", icon: MousePointer2, key: "v", group: "pointer" },
  { id: "hand", label: "Pan", icon: Hand, key: "h", group: "pointer" },
  { id: "rect", label: "Rectangle", icon: Square, key: "r", group: "shape" },
  { id: "ellipse", label: "Ellipse", icon: Circle, key: "o", group: "shape" },
  { id: "diamond", label: "Diamond", icon: Diamond, key: "d", group: "shape" },
  { id: "text", label: "Text", icon: Type, key: "t", group: "shape" },
  { id: "frame", label: "Frame", icon: Frame, key: "f", group: "shape" },
  { id: "line", label: "Line", icon: Minus, key: "l", group: "shape" },
  { id: "arrow", label: "Arrow", icon: ArrowRight, key: "a", group: "shape" },
  { id: "connector", label: "Connector", icon: Link2, key: "c", group: "shape" },
  { id: "draw", label: "Draw", icon: Pencil, key: "p", group: "ink" },
  { id: "highlighter", label: "Highlighter", icon: Highlighter, key: "m", group: "ink" },
  { id: "eraser", label: "Eraser", icon: Eraser, key: "e", group: "ink" },
];

export const TOOL_BY_KEY: Record<string, Tool> = Object.fromEntries(
  TOOL_SPECS.map((spec) => [spec.key, spec.id]),
);

/** Tools that create something by dragging a bounding box. */
export const BOX_TOOLS: Tool[] = ["rect", "ellipse", "diamond", "text", "frame"];
export const LINE_TOOLS: Tool[] = ["line", "arrow"];
export const INK_TOOLS: Tool[] = ["draw", "highlighter"];

export function cursorFor(tool: Tool, panning: boolean): string {
  if (panning) return "grabbing";
  switch (tool) {
    case "select":
      return "default";
    case "hand":
      return "grab";
    case "eraser":
      return "cell";
    case "draw":
    case "highlighter":
      return "crosshair";
    default:
      return "crosshair";
  }
}
