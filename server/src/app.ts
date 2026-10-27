import express, { type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { Config } from "./config.js";
import type { Board, Store } from "./store/types.js";
import { canEdit, roleOf } from "./store/types.js";
import type { RoomManager } from "./rooms.js";
import {
  clearSessionCookie, hashPassword, publicUser, requireAuth, setSessionCookie, signSession, signSocketToken, verifyPassword,
} from "./auth.js";
import { welcomeBoardState } from "./shapes.js";

export interface AppDeps {
  config: Config;
  store: Store;
  rooms: RoomManager;
  /** Called when a board is deleted so connected clients can be told. */
  onBoardDeleted?: (boardId: string) => void;
}

const credentials = z.object({
  email: z.email().max(150),
  password: z.string().min(8, "Password must be at least 8 characters").max(100),
});
const signup = credentials.extend({ name: z.string().trim().min(1).max(60) });
const boardName = z.object({ name: z.string().trim().min(1).max(80) });
const join = z.object({ invite: z.string().min(10).max(64) });

class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

export function createApp({ config, store, rooms, onBoardDeleted }: AppDeps) {
  const app = express();
  app.set("trust proxy", config.trustProxyHops);
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: config.clientOrigins, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  const authLimiter = rateLimit({
    windowMs: 60_000,
    limit: config.authRateLimit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "RATE_LIMITED", message: "Too many attempts. Try again in a minute." },
  });
  const auth = requireAuth(config);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, ...rooms.stats() });
  });

  // ---------- Auth ----------
  const startSession = async (res: Response, userId: string) => {
    setSessionCookie(config, res, signSession(config, userId));
  };

  app.post("/api/auth/signup", authLimiter, asyncRoute(async (req, res) => {
    const body = signup.parse(req.body);
    if (await store.findUserByEmail(body.email)) throw new HttpError(409, "EMAIL_TAKEN", "An account with this email already exists.");
    const user = await store.createUser({
      email: body.email, name: body.name, passwordHash: await hashPassword(body.password), isDemo: false,
    });
    await createWelcomeBoard(store, user.id);
    await startSession(res, user.id);
    res.status(201).json({ user: publicUser(user) });
  }));

  app.post("/api/auth/login", authLimiter, asyncRoute(async (req, res) => {
    const body = credentials.parse(req.body);
    const user = await store.findUserByEmail(body.email);
    const ok = user?.passwordHash ? await verifyPassword(body.password, user.passwordHash) : false;
    // Same message either way, so the endpoint doesn't reveal which emails are registered.
    if (!user || !ok) throw new HttpError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    await startSession(res, user.id);
    res.json({ user: publicUser(user) });
  }));

  /** One-click demo: a fresh guest account with a starter board, so recruiters never share a board by accident. */
  app.post("/api/auth/demo", authLimiter, asyncRoute(async (_req, res) => {
    const tag = nanoid(6).toLowerCase();
    const animals = ["Otter", "Panda", "Falcon", "Koala", "Lynx", "Heron", "Fox", "Orca"];
    const name = `Guest ${animals[Math.floor(Math.random() * animals.length)]}`;
    const user = await store.createUser({ email: `guest-${tag}@demo.canvashub.app`, name, passwordHash: null, isDemo: true });
    await createWelcomeBoard(store, user.id);
    await startSession(res, user.id);
    res.status(201).json({ user: publicUser(user) });
  }));

  app.post("/api/auth/logout", (_req, res) => {
    clearSessionCookie(config, res);
    res.status(204).end();
  });

  app.get("/api/auth/me", auth, asyncRoute(async (req, res) => {
    const user = await store.findUserById(req.userId!);
    if (!user) throw new HttpError(401, "UNAUTHENTICATED", "Please sign in.");
    res.json({ user: publicUser(user) });
  }));

  app.get("/api/auth/socket-token", auth, (req, res) => {
    res.json({ token: signSocketToken(config, req.userId!) });
  });

  // ---------- Boards ----------
  const loadBoard = async (req: Request) => {
    const board = await store.findBoard(String(req.params.id));
    const role = board ? roleOf(board, req.userId!) : null;
    // 404 for boards you can't see, so ids can't be probed.
    if (!board || !role) throw new HttpError(404, "NOT_FOUND", "Board not found.");
    return { board, role };
  };

  app.get("/api/boards", auth, asyncRoute(async (req, res) => {
    const boards = await store.listBoardsForUser(req.userId!);
    const owners = await store.findUsersByIds([...new Set(boards.map((b) => b.ownerId))]);
    const ownerName = new Map(owners.map((o) => [o.id, o.name]));
    res.json({
      boards: boards.map((b) => ({
        ...summary(b, req.userId!),
        ownerName: ownerName.get(b.ownerId) ?? "Unknown",
      })),
    });
  }));

  app.post("/api/boards", auth, asyncRoute(async (req, res) => {
    const { name } = boardName.parse(req.body);
    const board = await store.createBoard(newBoard(name, req.userId!, null));
    res.status(201).json({ board: details(board, req.userId!) });
  }));

  app.get("/api/boards/:id", auth, asyncRoute(async (req, res) => {
    const { board } = await loadBoard(req);
    const people = await store.findUsersByIds([board.ownerId, ...board.members.map((m) => m.userId)]);
    const names = new Map(people.map((p) => [p.id, p.name]));
    res.json({
      board: {
        ...details(board, req.userId!),
        members: [
          { userId: board.ownerId, name: names.get(board.ownerId) ?? "Owner", role: "owner" },
          ...board.members.map((m) => ({ ...m, name: names.get(m.userId) ?? "Unknown" })),
        ],
      },
    });
  }));

  app.patch("/api/boards/:id", auth, asyncRoute(async (req, res) => {
    const { board, role } = await loadBoard(req);
    if (!canEdit(role)) throw new HttpError(403, "FORBIDDEN", "You can view this board but not rename it.");
    const { name } = boardName.parse(req.body);
    const updated = await store.updateBoard(board.id, { name });
    res.json({ board: details(updated!, req.userId!) });
  }));

  app.delete("/api/boards/:id", auth, asyncRoute(async (req, res) => {
    const { board, role } = await loadBoard(req);
    if (role !== "owner") throw new HttpError(403, "FORBIDDEN", "Only the owner can delete this board.");
    rooms.discard(board.id);
    await store.deleteBoard(board.id);
    onBoardDeleted?.(board.id);
    res.status(204).end();
  }));

  /** Rotates both share links; anyone holding an old link can no longer join. */
  app.post("/api/boards/:id/invites/rotate", auth, asyncRoute(async (req, res) => {
    const { board, role } = await loadBoard(req);
    if (role !== "owner") throw new HttpError(403, "FORBIDDEN", "Only the owner can reset share links.");
    const updated = await store.updateBoard(board.id, { editInvite: inviteToken(), viewInvite: inviteToken() });
    res.json({ board: details(updated!, req.userId!) });
  }));

  app.post("/api/boards/:id/join", auth, asyncRoute(async (req, res) => {
    const { invite } = join.parse(req.body);
    const board = await store.findBoard(String(req.params.id));
    const role = board && invite === board.editInvite ? "editor" : board && invite === board.viewInvite ? "viewer" : null;
    if (!board || !role) throw new HttpError(404, "INVALID_INVITE", "This share link is invalid or has been reset.");
    const updated = await store.addMember(board.id, { userId: req.userId!, role });
    res.json({ board: details(updated!, req.userId!) });
  }));

  // ---------- Versions ----------
  app.get("/api/boards/:id/versions", auth, asyncRoute(async (req, res) => {
    const { board } = await loadBoard(req);
    const versions = await store.listVersions(board.id);
    const authors = await store.findUsersByIds([...new Set(versions.map((v) => v.createdBy))]);
    const authorName = new Map(authors.map((a) => [a.id, a.name]));
    res.json({
      versions: versions.map((v) => ({
        id: v.id, name: v.name, shapeCount: v.shapeCount, createdAt: v.createdAt, createdBy: authorName.get(v.createdBy) ?? "Unknown",
      })),
    });
  }));

  app.post("/api/boards/:id/versions", auth, asyncRoute(async (req, res) => {
    const { board, role } = await loadBoard(req);
    if (!canEdit(role)) throw new HttpError(403, "FORBIDDEN", "Viewers can't save versions.");
    const { name } = boardName.parse(req.body);
    const current = await rooms.currentState(board.id);
    const v = await store.createVersion({ boardId: board.id, name, state: current!.state, shapeCount: current!.shapeCount, createdBy: req.userId! });
    res.status(201).json({ version: { id: v.id, name: v.name, shapeCount: v.shapeCount, createdAt: v.createdAt } });
  }));

  app.get("/api/boards/:id/versions/:vid", auth, asyncRoute(async (req, res) => {
    const { board } = await loadBoard(req);
    const v = await store.findVersion(board.id, String(req.params.vid));
    if (!v) throw new HttpError(404, "NOT_FOUND", "Version not found.");
    res.json({ version: { id: v.id, name: v.name, state: Buffer.from(v.state).toString("base64") } });
  }));

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "NOT_FOUND", message: "No such endpoint." });
  });

  // Single error shape for every failure; no stack traces leave the server.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "VALIDATION", message: err.issues[0]?.message ?? "Invalid request." });
      return;
    }
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.code, message: err.message });
      return;
    }
    if ((err as { code?: number })?.code === 11000) {
      res.status(409).json({ error: "CONFLICT", message: "That already exists." });
      return;
    }
    if ((err as { type?: string })?.type === "entity.parse.failed") {
      res.status(400).json({ error: "VALIDATION", message: "Malformed JSON." });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "INTERNAL", message: "Something went wrong." });
  });

  return app;
}

const inviteToken = () => nanoid(24);

function newBoard(name: string, ownerId: string, state: Uint8Array | null): Omit<Board, "id" | "createdAt" | "updatedAt"> {
  return { name, ownerId, members: [], editInvite: inviteToken(), viewInvite: inviteToken(), state, shapeCount: 0 };
}

async function createWelcomeBoard(store: Store, ownerId: string) {
  const b = newBoard("Welcome board", ownerId, welcomeBoardState());
  b.shapeCount = 8;
  await store.createBoard(b);
}

function summary(b: Board, userId: string) {
  return { id: b.id, name: b.name, role: roleOf(b, userId), shapeCount: b.shapeCount, updatedAt: b.updatedAt, createdAt: b.createdAt };
}

/** Invite tokens are shown only to people who can share: owner sees both, editors see the view link. */
function details(b: Board, userId: string) {
  const role = roleOf(b, userId);
  return {
    ...summary(b, userId),
    invites: role === "owner" ? { edit: b.editInvite, view: b.viewInvite } : role === "editor" ? { view: b.viewInvite } : {},
  };
}
