import type Konva from "konva";
import type { Shape } from "./types";
import { shapeBounds, unionBounds, worldToScreen, type Viewport } from "./geometry";

/** Renders every shape (not just what's on screen) to a PNG with a white background and downloads it. */
export function exportPng(stage: Konva.Stage, shapes: Shape[], viewport: Viewport, fileName: string) {
  const bounds = unionBounds(shapes.map(shapeBounds));
  if (!bounds) return false;
  const pad = 32;
  const topLeft = worldToScreen({ x: bounds.x - pad, y: bounds.y - pad }, viewport);
  const width = (bounds.width + pad * 2) * viewport.scale;
  const height = (bounds.height + pad * 2) * viewport.scale;

  const content = stage.findOne<Konva.Layer>(".content")!;
  const pixelRatio = Math.min(4, 2 / viewport.scale);
  const canvas = content.toCanvas({ x: topLeft.x, y: topLeft.y, width, height, pixelRatio });

  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);

  const a = document.createElement("a");
  a.download = `${fileName.replace(/[^\w\- ]+/g, "").trim() || "board"}.png`;
  a.href = out.toDataURL("image/png");
  a.click();
  return true;
}
