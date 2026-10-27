export type Role = "owner" | "editor" | "viewer";

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string | null; // null for one-click demo accounts
  isDemo: boolean;
  createdAt: Date;
}

export interface Member {
  userId: string;
  role: Role;
}

export interface Board {
  id: string;
  name: string;
  ownerId: string;
  members: Member[];
  /** Secret tokens embedded in share links. Rotating one invalidates old links. */
  editInvite: string;
  viewInvite: string;
  /** Full Yjs document state (Y.encodeStateAsUpdate). */
  state: Uint8Array | null;
  shapeCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Version {
  id: string;
  boardId: string;
  name: string;
  state: Uint8Array;
  shapeCount: number;
  createdBy: string;
  createdAt: Date;
}

export interface Store {
  createUser(u: Omit<User, "id" | "createdAt">): Promise<User>;
  findUserByEmail(email: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  findUsersByIds(ids: string[]): Promise<User[]>;

  createBoard(b: Omit<Board, "id" | "createdAt" | "updatedAt">): Promise<Board>;
  findBoard(id: string): Promise<Board | null>;
  listBoardsForUser(userId: string): Promise<Board[]>;
  updateBoard(id: string, patch: Partial<Omit<Board, "id" | "createdAt">>): Promise<Board | null>;
  addMember(boardId: string, member: Member): Promise<Board | null>;
  deleteBoard(id: string): Promise<void>;

  createVersion(v: Omit<Version, "id" | "createdAt">): Promise<Version>;
  listVersions(boardId: string): Promise<Version[]>;
  findVersion(boardId: string, id: string): Promise<Version | null>;

  close(): Promise<void>;
}

export function roleOf(board: Board, userId: string): Role | null {
  if (board.ownerId === userId) return "owner";
  return board.members.find((m) => m.userId === userId)?.role ?? null;
}

export const canEdit = (role: Role | null) => role === "owner" || role === "editor";
