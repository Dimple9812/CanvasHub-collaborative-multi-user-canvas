export type ShapeType = "rect" | "ellipse" | "line" | "arrow" | "pen" | "text" | "sticky";

/** One object on the canvas. Stored as a plain value in the board's Y.Map("shapes"). */
export interface Shape {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  stroke: string;
  fill: string;
  strokeWidth: number;
  /** Relative to (x, y) for line, arrow and pen. */
  points?: number[];
  text?: string;
  fontSize?: number;
  z: number;
}

export type Tool = "select" | "hand" | ShapeType;
export type Role = "owner" | "editor" | "viewer";

export interface Peer {
  id: string;
  userId: string;
  name: string;
  color: string;
  cursor: { x: number; y: number } | null;
  selection: string[];
}

export type ConnectionStatus = "connecting" | "live" | "offline" | "reconnecting" | "denied";

export interface User {
  id: string;
  name: string;
  email: string;
  isDemo: boolean;
}

export interface BoardSummary {
  id: string;
  name: string;
  role: Role;
  shapeCount: number;
  updatedAt: string;
  createdAt: string;
  ownerName?: string;
}

export interface BoardDetails extends BoardSummary {
  invites: { edit?: string; view?: string };
  members?: { userId: string; name: string; role: Role }[];
}

export interface VersionSummary {
  id: string;
  name: string;
  shapeCount: number;
  createdAt: string;
  createdBy: string;
}
