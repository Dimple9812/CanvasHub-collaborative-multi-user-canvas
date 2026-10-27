import mongoose, { Schema, type Model } from "mongoose";
import { nanoid } from "nanoid";
import type { Board, Member, Store, User, Version } from "./types.js";

const userSchema = new Schema(
  {
    _id: { type: String, default: () => nanoid() },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    passwordHash: { type: String, default: null },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

const memberSchema = new Schema(
  { userId: { type: String, required: true }, role: { type: String, enum: ["editor", "viewer"], required: true } },
  { _id: false },
);

const boardSchema = new Schema(
  {
    _id: { type: String, default: () => nanoid(12) },
    name: { type: String, required: true },
    ownerId: { type: String, required: true, index: true },
    members: { type: [memberSchema], default: [] },
    editInvite: { type: String, required: true },
    viewInvite: { type: String, required: true },
    state: { type: Buffer, default: null },
    shapeCount: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false },
);
boardSchema.index({ "members.userId": 1 });

const versionSchema = new Schema(
  {
    _id: { type: String, default: () => nanoid(10) },
    boardId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    state: { type: Buffer, required: true },
    shapeCount: { type: Number, default: 0 },
    createdBy: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

/* eslint-disable @typescript-eslint/no-explicit-any */
const toUser = (d: any): User => ({
  id: d._id, email: d.email, name: d.name, passwordHash: d.passwordHash ?? null, isDemo: !!d.isDemo, createdAt: d.createdAt,
});
const toBytes = (b: any): Uint8Array | null => (b ? new Uint8Array(b.buffer ? b.buffer : b) : null);
const toBoard = (d: any): Board => ({
  id: d._id,
  name: d.name,
  ownerId: d.ownerId,
  members: (d.members ?? []).map((m: any) => ({ userId: m.userId, role: m.role })),
  editInvite: d.editInvite,
  viewInvite: d.viewInvite,
  state: toBytes(d.state),
  shapeCount: d.shapeCount ?? 0,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
});
const toVersion = (d: any): Version => ({
  id: d._id, boardId: d.boardId, name: d.name, state: toBytes(d.state)!, shapeCount: d.shapeCount ?? 0,
  createdBy: d.createdBy, createdAt: d.createdAt,
});
const toBuffer = (u: Uint8Array | null | undefined) => (u ? Buffer.from(u) : u);

export class MongoStore implements Store {
  private User: Model<any>;
  private Board: Model<any>;
  private Version: Model<any>;

  private constructor(private conn: mongoose.Connection) {
    this.User = conn.model("User", userSchema);
    this.Board = conn.model("Board", boardSchema);
    this.Version = conn.model("Version", versionSchema);
  }

  static async connect(uri: string) {
    const conn = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 10_000 }).asPromise();
    const store = new MongoStore(conn);
    await Promise.all([store.User.init(), store.Board.init(), store.Version.init()]);
    return store;
  }

  async createUser(u: Omit<User, "id" | "createdAt">) {
    return toUser(await this.User.create(u));
  }
  async findUserByEmail(email: string) {
    const d = await this.User.findOne({ email: email.toLowerCase() }).lean();
    return d ? toUser(d) : null;
  }
  async findUserById(id: string) {
    const d = await this.User.findById(id).lean();
    return d ? toUser(d) : null;
  }
  async findUsersByIds(ids: string[]) {
    return (await this.User.find({ _id: { $in: ids } }).lean()).map(toUser);
  }

  async createBoard(b: Omit<Board, "id" | "createdAt" | "updatedAt">) {
    return toBoard(await this.Board.create({ ...b, state: toBuffer(b.state) }));
  }
  async findBoard(id: string) {
    const d = await this.Board.findById(id).lean();
    return d ? toBoard(d) : null;
  }
  async listBoardsForUser(userId: string) {
    const docs = await this.Board.find({ $or: [{ ownerId: userId }, { "members.userId": userId }] })
      .select("-state")
      .sort({ updatedAt: -1 })
      .lean();
    return docs.map(toBoard);
  }
  async updateBoard(id: string, patch: Partial<Omit<Board, "id" | "createdAt">>) {
    const update: any = { ...patch };
    if ("state" in patch) update.state = toBuffer(patch.state);
    const d = await this.Board.findByIdAndUpdate(id, update, { new: true }).lean();
    return d ? toBoard(d) : null;
  }
  async addMember(boardId: string, member: Member) {
    const board = await this.findBoard(boardId);
    if (!board) return null;
    if (board.ownerId === member.userId) return board;
    const existing = board.members.find((m) => m.userId === member.userId);
    if (!existing) {
      await this.Board.updateOne({ _id: boardId, "members.userId": { $ne: member.userId } }, { $push: { members: member } });
    } else if (member.role === "editor" && existing.role !== "editor") {
      await this.Board.updateOne({ _id: boardId, "members.userId": member.userId }, { $set: { "members.$.role": "editor" } });
    }
    return this.findBoard(boardId);
  }
  async deleteBoard(id: string) {
    await Promise.all([this.Board.deleteOne({ _id: id }), this.Version.deleteMany({ boardId: id })]);
  }

  async createVersion(v: Omit<Version, "id" | "createdAt">) {
    return toVersion(await this.Version.create({ ...v, state: Buffer.from(v.state) }));
  }
  async listVersions(boardId: string) {
    return (await this.Version.find({ boardId }).sort({ createdAt: -1 }).limit(50).lean()).map(toVersion);
  }
  async findVersion(boardId: string, id: string) {
    const d = await this.Version.findOne({ _id: id, boardId }).lean();
    return d ? toVersion(d) : null;
  }

  async close() {
    await this.conn.close();
  }
}
