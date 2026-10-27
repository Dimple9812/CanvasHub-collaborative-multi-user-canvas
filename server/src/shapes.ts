import * as Y from "yjs";

/** Shape record stored in the board's Y.Map("shapes"). Mirrors client/src/lib/types.ts. */
export interface Shape {
  id: string;
  type: "rect" | "ellipse" | "line" | "arrow" | "pen" | "text" | "sticky";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  stroke: string;
  fill: string;
  strokeWidth: number;
  points?: number[];
  text?: string;
  fontSize?: number;
  z: number;
}

export const SHAPES_KEY = "shapes";

export function shapeCount(doc: Y.Doc) {
  return doc.getMap(SHAPES_KEY).size;
}

/** Builds the starter board every new demo account gets, so the canvas is never empty on first look. */
export function welcomeBoardState(): Uint8Array {
  const doc = new Y.Doc();
  const shapes = doc.getMap<Shape>(SHAPES_KEY);
  const base = { rotation: 0, strokeWidth: 2 };
  const items: Shape[] = [
    { ...base, id: "w-title", type: "text", x: 80, y: 60, width: 640, height: 50, stroke: "#1b2440", fill: "transparent", text: "Welcome to CanvasHub 👋", fontSize: 36, z: 1 },
    { ...base, id: "w-hint", type: "text", x: 80, y: 120, width: 640, height: 60, stroke: "#475569", fill: "transparent", text: "Open this board in a second tab (Share → Copy edit link) and watch edits and cursors sync live.", fontSize: 18, z: 2 },
    { ...base, id: "w-note1", type: "sticky", x: 80, y: 220, width: 220, height: 160, stroke: "#a16207", fill: "#fde68a", text: "Press R, O, A, P, T or S to pick a tool", fontSize: 18, z: 3 },
    { ...base, id: "w-note2", type: "sticky", x: 330, y: 220, width: 220, height: 160, stroke: "#047857", fill: "#a7f3d0", text: "Ctrl+Z / Ctrl+Shift+Z undo and redo only your own edits", fontSize: 18, z: 4 },
    { ...base, id: "w-note3", type: "sticky", x: 580, y: 220, width: 220, height: 160, stroke: "#1d4ed8", fill: "#bfdbfe", text: "Go offline, keep drawing, reconnect — everything merges", fontSize: 18, z: 5 },
    { ...base, id: "w-rect", type: "rect", x: 80, y: 430, width: 260, height: 140, stroke: "#6d28d9", fill: "#ede9fe", z: 6 },
    { ...base, id: "w-ellipse", type: "ellipse", x: 420, y: 430, width: 200, height: 140, stroke: "#be123c", fill: "#ffe4e6", z: 7 },
    { ...base, id: "w-arrow", type: "arrow", x: 340, y: 500, width: 80, height: 0, stroke: "#1b2440", fill: "transparent", points: [0, 0, 80, 0], strokeWidth: 3, z: 8 },
  ];
  doc.transact(() => items.forEach((s) => shapes.set(s.id, s)));
  return Y.encodeStateAsUpdate(doc);
}
