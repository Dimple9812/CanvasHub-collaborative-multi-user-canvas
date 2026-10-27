import type { Shape, ShapeType } from "./types";
import type { Style } from "../store/editor";
import { STICKY_FILLS } from "../store/editor";

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 12) : Math.random().toString(36).slice(2, 14);

export const isPointShape = (t: ShapeType) => t === "line" || t === "arrow" || t === "pen";
export const hasFill = (t: ShapeType) => t === "rect" || t === "ellipse";
export const hasText = (t: ShapeType) => t === "text" || t === "sticky";

export function createShape(type: ShapeType, style: Style, z: number, at: { x: number; y: number }): Shape {
  const base: Shape = {
    id: newId(),
    type,
    x: at.x,
    y: at.y,
    width: 0,
    height: 0,
    rotation: 0,
    stroke: style.stroke,
    fill: hasFill(type) ? style.fill : "transparent",
    strokeWidth: style.strokeWidth,
    z,
  };
  if (isPointShape(type)) return { ...base, points: [0, 0] };
  if (type === "text") return { ...base, width: 280, height: style.fontSize * 1.4, text: "", fontSize: style.fontSize };
  if (type === "sticky") {
    const fill = STICKY_FILLS.includes(style.fill) ? style.fill : STICKY_FILLS[0];
    return { ...base, x: at.x - 100, y: at.y - 80, width: 200, height: 160, fill, stroke: "#1c2433", text: "", fontSize: 18 };
  }
  return base;
}

/** Shapes drawn with a single click get a sensible default size instead of disappearing. */
export function finalizeDraft(s: Shape): Shape | null {
  if (isPointShape(s.type)) {
    const pts = s.points ?? [];
    if (pts.length < 4) return null;
    const dx = pts[pts.length - 2] - pts[0];
    const dy = pts[pts.length - 1] - pts[1];
    if (s.type !== "pen" && Math.hypot(dx, dy) < 4) return { ...s, points: [0, 0, 120, 0] };
    return s;
  }
  if ((s.type === "rect" || s.type === "ellipse") && (s.width < 4 || s.height < 4)) {
    return { ...s, x: s.x - 60, y: s.y - 40, width: 120, height: 80 };
  }
  return s;
}

export function duplicate(shapes: Shape[], z: number, offset = 24): Shape[] {
  return shapes.map((s, i) => ({ ...s, id: newId(), x: s.x + offset, y: s.y + offset, z: z + i, points: s.points ? [...s.points] : undefined }));
}

/** Readable text colour on a sticky note's fill. */
export const stickyTextColor = (fill: string) => (fill === "#bfdbfe" || fill === "#ddd6fe" ? "#1c2433" : "#3b2f00");
