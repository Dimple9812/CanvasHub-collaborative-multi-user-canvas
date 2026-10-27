import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import * as Y from "yjs";
import type { Config } from "./config.js";
import type { Store } from "./store/types.js";
import { canEdit, roleOf, type Role } from "./store/types.js";
import type { RoomManager } from "./rooms.js";
import { verifyToken } from "./auth.js";

/**
 * Sync protocol (Yjs state-vector exchange over Socket.IO):
 *  1. client -> "join" { boardId, stateVector }    (what the client already has)
 *  2. server ack       { update, stateVector, ... } (everything the client is missing + what the server has)
 *  3. client -> "update" diff(local, serverStateVector) (edits made offline, if any)
 *  4. afterwards every local change is sent as an incremental "update" and fanned out to the room.
 * Because Yjs updates are commutative and idempotent, order and duplicates don't matter.
 */

interface SocketData {
  userId: string;
  name: string;
  color: string;
  boardId?: string;
  role?: Role;
  tokens: number;
  lastRefill: number;
}

export interface Presence {
  id: string;
  userId: string;
  name: string;
  color: string;
  cursor: { x: number; y: number } | null;
  selection: string[];
}

const PALETTE = ["#e11d48", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#4d7c0f"];
const colorFor = (userId: string) => PALETTE[[...userId].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];

const UPDATES_PER_SECOND = 60; // token bucket; generous for dragging, stops floods
const MAX_UPDATE_BYTES = 512 * 1024;

const room = (boardId: string) => `board:${boardId}`;

export function attachRealtime(http: HttpServer, { config, store, rooms }: { config: Config; store: Store; rooms: RoomManager }) {
  const io = new Server<any, any, any, SocketData>(http, {
    cors: { origin: config.clientOrigins, credentials: true },
    maxHttpBufferSize: MAX_UPDATE_BYTES,
    pingInterval: 20_000,
    pingTimeout: 20_000,
  });
  const presence = new Map<string, Map<string, Presence>>(); // boardId -> socketId -> presence

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    const userId = typeof token === "string" ? verifyToken(config, token, "socket") : null;
    if (!userId) return next(new Error("UNAUTHENTICATED"));
    const user = await store.findUserById(userId);
    if (!user) return next(new Error("UNAUTHENTICATED"));
    socket.data = { userId, name: user.name, color: colorFor(userId), tokens: UPDATES_PER_SECOND, lastRefill: Date.now() };
    next();
  });

  io.on("connection", (socket: Socket<any, any, any, SocketData>) => {
    socket.on("join", async (msg: { boardId?: string; stateVector?: Uint8Array }, ack?: (res: unknown) => void) => {
      const reply = typeof ack === "function" ? ack : () => {};
      try {
        const boardId = String(msg?.boardId ?? "");
        const board = await store.findBoard(boardId);
        const role = board ? roleOf(board, socket.data.userId) : null;
        if (!board || !role) return reply({ ok: false, error: "NOT_FOUND" });

        if (socket.data.boardId && socket.data.boardId !== boardId) await leave(socket);
        const doc = await rooms.open(boardId, socket.id);
        socket.data.boardId = boardId;
        socket.data.role = role;
        await socket.join(room(boardId));

        const sv = msg?.stateVector ? new Uint8Array(msg.stateVector) : undefined;
        const peers = [...(presence.get(boardId)?.values() ?? [])];
        reply({
          ok: true,
          role,
          you: { id: socket.id, name: socket.data.name, color: socket.data.color },
          update: Y.encodeStateAsUpdate(doc, sv),
          stateVector: Y.encodeStateVector(doc),
          peers,
        });
        setPresence(socket, { cursor: null, selection: [] });
      } catch (err) {
        console.error("[realtime] join failed", err);
        reply({ ok: false, error: "INTERNAL" });
      }
    });

    socket.on("update", (update: Uint8Array, ack?: (res: unknown) => void) => {
      const reply = typeof ack === "function" ? ack : () => {};
      const { boardId, role } = socket.data;
      if (!boardId) return reply({ ok: false, error: "NOT_JOINED" });
      if (!canEdit(role ?? null)) return reply({ ok: false, error: "READ_ONLY" });
      if (!takeToken(socket.data)) return reply({ ok: false, error: "RATE_LIMITED" });
      try {
        const bytes = new Uint8Array(update);
        rooms.apply(boardId, bytes, socket.id);
        socket.to(room(boardId)).emit("update", bytes);
        reply({ ok: true });
      } catch (err) {
        console.error("[realtime] bad update", err);
        reply({ ok: false, error: "BAD_UPDATE" });
      }
    });

    socket.on("presence", (p: { cursor?: { x: number; y: number } | null; selection?: string[] }) => {
      if (!socket.data.boardId) return;
      const cursor =
        p?.cursor && Number.isFinite(p.cursor.x) && Number.isFinite(p.cursor.y) ? { x: p.cursor.x, y: p.cursor.y } : null;
      const selection = Array.isArray(p?.selection) ? p.selection.slice(0, 200).map(String) : [];
      setPresence(socket, { cursor, selection });
    });

    socket.on("disconnect", () => {
      void leave(socket);
    });
  });

  function setPresence(socket: Socket<any, any, any, SocketData>, p: Pick<Presence, "cursor" | "selection">) {
    const boardId = socket.data.boardId!;
    // Name and colour come from the server, so a client can't impersonate someone else.
    const entry: Presence = { id: socket.id, userId: socket.data.userId, name: socket.data.name, color: socket.data.color, ...p };
    if (!presence.has(boardId)) presence.set(boardId, new Map());
    presence.get(boardId)!.set(socket.id, entry);
    socket.volatile.to(room(boardId)).emit("presence", entry);
  }

  async function leave(socket: Socket<any, any, any, SocketData>) {
    const boardId = socket.data.boardId;
    if (!boardId) return;
    socket.data.boardId = undefined;
    socket.leave(room(boardId));
    const peers = presence.get(boardId);
    peers?.delete(socket.id);
    if (peers && peers.size === 0) presence.delete(boardId);
    io.to(room(boardId)).emit("presence-leave", { id: socket.id });
    await rooms.leave(boardId, socket.id);
  }

  return {
    io,
    notifyBoardDeleted(boardId: string) {
      io.to(room(boardId)).emit("board-deleted", { boardId });
      io.in(room(boardId)).socketsLeave(room(boardId));
      presence.delete(boardId);
    },
  };
}

function takeToken(d: SocketData) {
  const now = Date.now();
  d.tokens = Math.min(UPDATES_PER_SECOND, d.tokens + ((now - d.lastRefill) / 1000) * UPDATES_PER_SECOND);
  d.lastRefill = now;
  if (d.tokens < 1) return false;
  d.tokens -= 1;
  return true;
}
