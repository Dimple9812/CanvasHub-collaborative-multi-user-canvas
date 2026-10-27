import { create } from "zustand";
import type { Tool } from "../lib/types";
import type { Viewport } from "../lib/geometry";

export interface Style {
  stroke: string;
  fill: string;
  strokeWidth: number;
  fontSize: number;
}

export const STROKES = ["#1c2433", "#2f5bea", "#e11d48", "#16a34a", "#d97706", "#7c3aed"];
export const FILLS = ["transparent", "#ffffff", "#dbe4ff", "#ffe0e6", "#d9f5e1", "#fff1c2"];
export const STICKY_FILLS = ["#ffd84d", "#a7f3d0", "#bfdbfe", "#fecdd3", "#ddd6fe"];
export const WIDTHS = [1, 2, 4, 8];

interface EditorState {
  tool: Tool;
  /** Tool to return to after holding space to pan. */
  previousTool: Tool | null;
  style: Style;
  selection: string[];
  viewport: Viewport;
  editingTextId: string | null;
  setTool: (tool: Tool) => void;
  setStyle: (patch: Partial<Style>) => void;
  setSelection: (ids: string[]) => void;
  setViewport: (vp: Viewport) => void;
  setEditingText: (id: string | null) => void;
  startTemporaryPan: () => void;
  endTemporaryPan: () => void;
  reset: () => void;
}

const initial = {
  tool: "select" as Tool,
  previousTool: null,
  style: { stroke: STROKES[0], fill: "transparent", strokeWidth: 2, fontSize: 24 },
  selection: [] as string[],
  viewport: { x: 0, y: 0, scale: 1 },
  editingTextId: null,
};

export const useEditor = create<EditorState>((set, get) => ({
  ...initial,
  setTool: (tool) => set({ tool, selection: tool === "select" ? get().selection : [], editingTextId: null }),
  setStyle: (patch) => set({ style: { ...get().style, ...patch } }),
  setSelection: (selection) => set({ selection }),
  setViewport: (viewport) => set({ viewport }),
  setEditingText: (editingTextId) => set({ editingTextId }),
  startTemporaryPan: () => {
    const { tool, previousTool } = get();
    if (tool !== "hand" && previousTool === null) set({ previousTool: tool, tool: "hand" });
  },
  endTemporaryPan: () => {
    const { previousTool } = get();
    if (previousTool) set({ tool: previousTool, previousTool: null });
  },
  reset: () => set(initial),
}));
