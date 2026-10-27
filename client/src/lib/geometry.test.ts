import { boxFromDrag, fitViewport, intersects, screenToWorld, shapeBounds, simplifyPoints, worldToScreen, zoomAt } from "./geometry";
import type { Shape } from "./types";

const shape = (p: Partial<Shape>): Shape => ({
  id: "s", type: "rect", x: 0, y: 0, width: 10, height: 10, rotation: 0, stroke: "#000", fill: "transparent", strokeWidth: 2, z: 1, ...p,
});

describe("geometry", () => {
  it("converts between screen and world coordinates", () => {
    const vp = { x: 100, y: 50, scale: 2 };
    const world = screenToWorld({ x: 300, y: 250 }, vp);
    expect(world).toEqual({ x: 100, y: 100 });
    expect(worldToScreen(world, vp)).toEqual({ x: 300, y: 250 });
  });

  it("normalises drags in any direction", () => {
    expect(boxFromDrag({ x: 50, y: 40 }, { x: 10, y: 0 })).toEqual({ x: 10, y: 0, width: 40, height: 40 });
  });

  it("zooms around the cursor so the point under it stays put", () => {
    const vp = { x: 0, y: 0, scale: 1 };
    const cursor = { x: 400, y: 300 };
    const before = screenToWorld(cursor, vp);
    const next = zoomAt(vp, cursor, 2);
    expect(next.scale).toBe(2);
    expect(screenToWorld(cursor, next)).toEqual(before);
    expect(zoomAt(vp, cursor, 999).scale).toBe(6); // clamped
  });

  it("computes bounds for point-based shapes including stroke", () => {
    const b = shapeBounds(shape({ type: "line", x: 10, y: 10, points: [0, 0, 100, -20], strokeWidth: 4 }));
    expect(b).toEqual({ x: 8, y: -12, width: 104, height: 24 });
  });

  it("detects box intersection", () => {
    expect(intersects({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
    expect(intersects({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 20, width: 5, height: 5 })).toBe(false);
  });

  it("fits content into the screen", () => {
    const vp = fitViewport({ x: 0, y: 0, width: 1000, height: 500 }, 1200, 700, 100);
    expect(vp.scale).toBe(1);
    expect(vp.x).toBe(100);
    expect(vp.y).toBe(100);
  });

  it("thins pen strokes but keeps both ends", () => {
    const pts = [0, 0, 0.2, 0.2, 0.4, 0.4, 5, 5, 5.1, 5.1, 10, 10];
    const out = simplifyPoints(pts, 1.5);
    expect(out.slice(0, 2)).toEqual([0, 0]);
    expect(out.slice(-2)).toEqual([10, 10]);
    expect(out.length).toBeLessThan(pts.length);
  });
});
