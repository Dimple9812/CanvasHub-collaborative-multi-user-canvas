import type { Shape } from "./types";

export interface Point {
  x: number;
  y: number;
}
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Viewport {
  x: number; // stage offset in screen pixels
  y: number;
  scale: number;
}

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 6;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const screenToWorld = (p: Point, vp: Viewport): Point => ({ x: (p.x - vp.x) / vp.scale, y: (p.y - vp.y) / vp.scale });
export const worldToScreen = (p: Point, vp: Viewport): Point => ({ x: p.x * vp.scale + vp.x, y: p.y * vp.scale + vp.y });

/** Box spanned by a drag, whichever direction it went. */
export function boxFromDrag(a: Point, b: Point): Box {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

/** Zoom around a fixed screen point (the cursor), so the thing under the pointer stays put. */
export function zoomAt(vp: Viewport, screen: Point, nextScale: number): Viewport {
  const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
  const world = screenToWorld(screen, vp);
  return { scale, x: screen.x - world.x * scale, y: screen.y - world.y * scale };
}

/** Axis-aligned bounds of a shape in world coordinates (rotation ignored for points-based shapes). */
export function shapeBounds(s: Shape): Box {
  if (s.points && s.points.length >= 2) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < s.points.length; i += 2) {
      minX = Math.min(minX, s.points[i]);
      maxX = Math.max(maxX, s.points[i]);
      minY = Math.min(minY, s.points[i + 1]);
      maxY = Math.max(maxY, s.points[i + 1]);
    }
    const pad = s.strokeWidth / 2;
    return { x: s.x + minX - pad, y: s.y + minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 };
  }
  return { x: s.x, y: s.y, width: s.width, height: s.height };
}

export function unionBounds(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.width));
  const maxY = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

/** Viewport that fits the given box in a screen of the given size, with padding. */
export function fitViewport(box: Box, screenW: number, screenH: number, padding = 80): Viewport {
  const scale = clamp(Math.min((screenW - padding * 2) / Math.max(box.width, 1), (screenH - padding * 2) / Math.max(box.height, 1)), MIN_SCALE, 2);
  return { scale, x: (screenW - box.width * scale) / 2 - box.x * scale, y: (screenH - box.height * scale) / 2 - box.y * scale };
}

/** Drops points closer than `minDist` to the previous kept point; keeps pen strokes light. */
export function simplifyPoints(points: number[], minDist = 1.5): number[] {
  if (points.length <= 4) return points;
  const out = [points[0], points[1]];
  for (let i = 2; i < points.length - 2; i += 2) {
    const dx = points[i] - out[out.length - 2];
    const dy = points[i + 1] - out[out.length - 1];
    if (dx * dx + dy * dy >= minDist * minDist) out.push(points[i], points[i + 1]);
  }
  out.push(points[points.length - 2], points[points.length - 1]);
  return out;
}
