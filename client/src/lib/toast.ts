import { create } from "zustand";

export interface ToastItem {
  id: number;
  text: string;
  tone: "info" | "error";
}

export const useToasts = create<{ items: ToastItem[] }>(() => ({ items: [] }));
let nextId = 1;

export function toast(text: string, tone: ToastItem["tone"] = "info") {
  const id = nextId++;
  useToasts.setState((s) => ({ items: [...s.items, { id, text, tone }] }));
  setTimeout(() => useToasts.setState((s) => ({ items: s.items.filter((t) => t.id !== id) })), 3500);
}
