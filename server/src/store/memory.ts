import { nanoid } from "nanoid";
import type { Board, Member, Store, User, Version } from "./types.js";

/** In-process store used for tests and for running the app without a database. */
export class MemoryStore implements Store {
  private users = new Map<string, User>();
  private boards = new Map<string, Board>();
  private versions = new Map<string, Version>();

  async createUser(u: Omit<User, "id" | "createdAt">) {
    if (await this.findUserByEmail(u.email)) throw Object.assign(new Error("duplicate"), { code: 11000 });
    const user: User = { ...u, email: u.email.toLowerCase(), id: nanoid(), createdAt: new Date() };
    this.users.set(user.id, user);
    return { ...user };
  }
  async findUserByEmail(email: string) {
    const e = email.toLowerCase();
    for (const u of this.users.values()) if (u.email === e) return { ...u };
    return null;
  }
  async findUserById(id: string) {
    const u = this.users.get(id);
    return u ? { ...u } : null;
  }
  async findUsersByIds(ids: string[]) {
    return ids.map((id) => this.users.get(id)).filter((u): u is User => !!u).map((u) => ({ ...u }));
  }

  async createBoard(b: Omit<Board, "id" | "createdAt" | "updatedAt">) {
    const now = new Date();
    const board: Board = { ...b, id: nanoid(12), members: [...b.members], createdAt: now, updatedAt: now };
    this.boards.set(board.id, board);
    return clone(board);
  }
  async findBoard(id: string) {
    const b = this.boards.get(id);
    return b ? clone(b) : null;
  }
  async listBoardsForUser(userId: string) {
    return [...this.boards.values()]
      .filter((b) => b.ownerId === userId || b.members.some((m) => m.userId === userId))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map(clone);
  }
  async updateBoard(id: string, patch: Partial<Omit<Board, "id" | "createdAt">>) {
    const b = this.boards.get(id);
    if (!b) return null;
    Object.assign(b, patch, { updatedAt: new Date() });
    return clone(b);
  }
  async addMember(boardId: string, member: Member) {
    const b = this.boards.get(boardId);
    if (!b) return null;
    const existing = b.members.find((m) => m.userId === member.userId);
    if (existing) {
      // An edit link upgrades a viewer; a view link never downgrades an editor.
      if (member.role === "editor") existing.role = "editor";
    } else if (b.ownerId !== member.userId) {
      b.members.push({ ...member });
    }
    return clone(b);
  }
  async deleteBoard(id: string) {
    this.boards.delete(id);
    for (const [vid, v] of this.versions) if (v.boardId === id) this.versions.delete(vid);
  }

  async createVersion(v: Omit<Version, "id" | "createdAt">) {
    const version: Version = { ...v, id: nanoid(10), createdAt: new Date() };
    this.versions.set(version.id, version);
    return { ...version };
  }
  async listVersions(boardId: string) {
    return [...this.versions.values()]
      .filter((v) => v.boardId === boardId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((v) => ({ ...v }));
  }
  async findVersion(boardId: string, id: string) {
    const v = this.versions.get(id);
    return v && v.boardId === boardId ? { ...v } : null;
  }

  async close() {}
}

const clone = (b: Board): Board => ({ ...b, members: b.members.map((m) => ({ ...m })) });
