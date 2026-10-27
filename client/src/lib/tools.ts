import { ArrowUpRight, Circle, Hand, Minus, MousePointer2, Pencil, Square, StickyNote, Type } from "lucide-react";
import type { Tool } from "./types";

export const TOOLS: { tool: Tool; label: string; key: string; icon: typeof Square }[] = [
  { tool: "select", label: "Select", key: "V", icon: MousePointer2 },
  { tool: "hand", label: "Pan", key: "H", icon: Hand },
  { tool: "rect", label: "Rectangle", key: "R", icon: Square },
  { tool: "ellipse", label: "Ellipse", key: "O", icon: Circle },
  { tool: "line", label: "Line", key: "L", icon: Minus },
  { tool: "arrow", label: "Arrow", key: "A", icon: ArrowUpRight },
  { tool: "pen", label: "Pen", key: "P", icon: Pencil },
  { tool: "text", label: "Text", key: "T", icon: Type },
  { tool: "sticky", label: "Sticky note", key: "S", icon: StickyNote },
];

