import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { io, type Socket } from "socket.io-client";
import type { ConnectionStatus, Peer, Role, Shape } from "./types";

/** Transaction origins. Only LOCAL edits are undoable and sent to the server. */
export const LOCAL = Symbol("local");
const REMOTE = Symbol("remote");

const FLUSH_MS = 30; // batch rapid edits (dragging) into ~33 messages/s max
const PRESENCE_MS = 40;

export interface SessionOptions {
  boardId: string;
  getToken: () => Promise<string>;
  /** Socket server origin; empty string means same origin (dev proxy). */
  socketUrl?: string;
  /** Keep a copy in IndexedDB so offline edits survive a page reload. */
  persistLocal?: boolean;
}

interface SessionState {
  status: ConnectionStatus;
  role: Role | null;
  you: { id: string; name: string; color: string } | null;
  deleted: boolean;
}

/**
 * Owns one board's shared document: local edits, undo history, the socket link,
 * offline persistence and other people's cursors. React reads it through the
 * subscribe/get* methods (see useBoard.ts).
 */
export class BoardSession {
  readonly doc = new Y.Doc();
  readonly shapes = this.doc.getMap<Shape>("shapes");
  readonly undoManager = new Y.UndoManager(this.shapes, { trackedOrigins: new Set([LOCAL]), captureTimeout: 400 });

  private socket: Socket | null = null;
  private idb: IndexeddbPersistence | null = null;
  private joined = false;
  private pending: Uint8Array[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private presenceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPresence: { cursor: { x: number; y: number } | null; selection: string[] } = { cursor: null, selection: [] };

  private shapeList: Shape[] = [];
  private peers = new Map<string, Peer>();
  private peerList: Peer[] = [];
  private state: SessionState = { status: "connecting", role: null, you: null, deleted: false };
  private listeners = new Set<() => void>();

  private opts: SessionOptions;

  constructor(opts: SessionOptions) {
    this.opts = opts;
    this.shapes.observe(() => {
      this.shapeList = sortByZ([...this.shapes.values()]);
      this.emit();
    });
    this.undoManager.on("stack-item-added", () => this.emit());
    this.undoManager.on("stack-item-popped", () => this.emit());
    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE || origin === this.idb) return;
      this.queue(update);
    });
  }

  async start() {
    if (this.opts.persistLocal !== false && typeof indexedDB !== "undefined") {
      this.idb = new IndexeddbPersistence(`canvashub:${this.opts.boardId}`, this.doc);
      // Don't let a slow IndexedDB block the network connection.
      await Promise.race([this.idb.whenSynced, new Promise((r) => setTimeout(r, 800))]);
    }
    this.connect();
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.onOnline);
      window.addEventListener("offline", this.onOffline);
    }
  }

  destroy() {
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.onOnline);
      window.removeEventListener("offline", this.onOffline);
    }
    if (this.flushTimer) clearTimeout(this.flushTimer);
    if (this.presenceTimer) clearTimeout(this.presenceTimer);
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    void this.idb?.destroy();
    this.undoManager.destroy();
    this.doc.destroy();
    this.listeners.clear();
  }

  // ---------- reading (stable references for useSyncExternalStore) ----------
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getShapes = () => this.shapeList;
  getPeers = () => this.peerList;
  getState = () => this.state;

  get canEdit() {
    return this.state.role === "owner" || this.state.role === "editor";
  }
  get canUndo() {
    return this.undoManager.undoStack.length > 0;
  }
  get canRedo() {
    return this.undoManager.redoStack.length > 0;
  }

  // ---------- editing ----------
  nextZ() {
    let max = 0;
    for (const s of this.shapes.values()) max = Math.max(max, s.z);
    return max + 1;
  }

  add(shape: Shape) {
    if (!this.canEditNow()) return;
    this.doc.transact(() => this.shapes.set(shape.id, shape), LOCAL);
  }

  update(id: string, patch: Partial<Shape>) {
    this.updateMany([[id, patch]]);
  }

  updateMany(patches: [string, Partial<Shape>][]) {
    if (!this.canEditNow()) return;
    this.doc.transact(() => {
      for (const [id, patch] of patches) {
        const current = this.shapes.get(id);
        if (current) this.shapes.set(id, { ...current, ...patch, id });
      }
    }, LOCAL);
  }

  remove(ids: string[]) {
    if (!this.canEditNow() || !ids.length) return;
    this.doc.transact(() => ids.forEach((id) => this.shapes.delete(id)), LOCAL);
  }

  bringToFront(ids: string[]) {
    let z = this.nextZ();
    this.updateMany(ids.map((id) => [id, { z: z++ }]));
  }

  /** Replaces every shape in one undoable step (used to restore a saved version). */
  replaceAll(next: Shape[]) {
    if (!this.canEditNow()) return;
    this.doc.transact(() => {
      for (const id of [...this.shapes.keys()]) this.shapes.delete(id);
      for (const s of next) this.shapes.set(s.id, s);
    }, LOCAL);
  }

  undo() {
    if (this.canEditNow()) this.undoManager.undo();
  }
  redo() {
    if (this.canEditNow()) this.undoManager.redo();
  }
  /** Ends the current undo step, so the next edit doesn't merge with the previous one. */
  stopCapturing() {
    this.undoManager.stopCapturing();
  }

  setPresence(p: { cursor?: { x: number; y: number } | null; selection?: string[] }) {
    this.lastPresence = { ...this.lastPresence, ...p };
    if (this.presenceTimer) return;
    this.presenceTimer = setTimeout(() => {
      this.presenceTimer = null;
      if (this.joined) this.socket?.volatile.emit("presence", this.lastPresence);
    }, PRESENCE_MS);
  }

  // ---------- network ----------
  private connect() {
    const socket = io(this.opts.socketUrl ?? "", {
      auth: (cb) => {
        this.opts.getToken().then((token) => cb({ token }), () => cb({ token: "" }));
      },
      transports: ["websocket", "polling"],
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });
    this.socket = socket;

    socket.on("connect", () => this.join());
    socket.on("disconnect", () => {
      this.joined = false;
      if (this.state.status !== "denied") this.setState({ status: navigator.onLine === false ? "offline" : "reconnecting" });
      this.clearPeers();
    });
    socket.on("connect_error", () => {
      if (this.state.status !== "denied") this.setState({ status: navigator.onLine === false ? "offline" : "reconnecting" });
    });
    socket.on("update", (u: ArrayBuffer) => Y.applyUpdate(this.doc, new Uint8Array(u), REMOTE));
    socket.on("presence", (p: Peer) => {
      if (p.id === this.state.you?.id) return;
      this.peers.set(p.id, p);
      this.peerList = [...this.peers.values()];
      this.emit();
    });
    socket.on("presence-leave", ({ id }: { id: string }) => {
      if (this.peers.delete(id)) {
        this.peerList = [...this.peers.values()];
        this.emit();
      }
    });
    socket.on("board-deleted", () => {
      void this.idb?.clearData();
      this.setState({ deleted: true, status: "denied" });
      socket.disconnect();
    });
  }

  private join() {
    const socket = this.socket!;
    socket.emit(
      "join",
      { boardId: this.opts.boardId, stateVector: Y.encodeStateVector(this.doc) },
      (res: { ok: boolean; error?: string; role?: Role; you?: SessionState["you"]; update?: ArrayBuffer; stateVector?: ArrayBuffer; peers?: Peer[] }) => {
        if (!res?.ok) {
          this.setState({ status: "denied" });
          socket.disconnect();
          return;
        }
        Y.applyUpdate(this.doc, new Uint8Array(res.update!), REMOTE);
        this.peers = new Map((res.peers ?? []).map((p) => [p.id, p]));
        this.peerList = [...this.peers.values()];
        this.joined = true;
        this.setState({ status: "live", role: res.role!, you: res.you! });

        // Anything we have that the server doesn't: edits made while offline.
        const missing = Y.encodeStateAsUpdate(this.doc, new Uint8Array(res.stateVector!));
        this.pending = [];
        if (missing.length > 2 && this.canEdit) this.send(missing);
        this.setPresence({});
      },
    );
  }

  private queue(update: Uint8Array) {
    this.pending.push(update);
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      if (!this.joined || !this.pending.length) return; // offline: the doc keeps the edits; join() sends them
      const merged = Y.mergeUpdates(this.pending);
      this.pending = [];
      this.send(merged);
    }, FLUSH_MS);
  }

  private send(update: Uint8Array) {
    this.socket?.emit("update", update, (res: { ok: boolean; error?: string }) => {
      if (res?.ok) return;
      if (res?.error === "READ_ONLY") {
        this.setState({ role: "viewer" });
        return;
      }
      // Dropped by the server (rate limit, restart): re-join, which re-sends whatever it's missing.
      setTimeout(() => this.socket?.connected && this.join(), 300);
    });
  }

  private canEditNow() {
    // Before the first join we don't know the role yet; allow edits so offline-first loading feels instant.
    return this.state.role === null ? !this.state.deleted : this.canEdit;
  }

  // The browser knows about connectivity before the socket times out, so act on it directly:
  // drop the socket when offline (edits stay in the doc and IndexedDB) and rejoin when back.
  private onOnline = () => {
    if (this.state.status === "denied") return;
    this.setState({ status: "reconnecting" });
    if (this.socket?.connected) this.join();
    else this.socket?.connect();
  };
  private onOffline = () => {
    this.socket?.disconnect();
    this.setState({ status: "offline" });
  };

  private clearPeers() {
    this.peers.clear();
    this.peerList = [];
  }

  private setState(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private emit() {
    this.listeners.forEach((fn) => fn());
  }
}

export const sortByZ = (list: Shape[]) => list.sort((a, b) => a.z - b.z || (a.id < b.id ? -1 : 1));

export function decodeShapes(base64State: string): Shape[] {
  const bytes = Uint8Array.from(atob(base64State), (c) => c.charCodeAt(0));
  const doc = new Y.Doc();
  Y.applyUpdate(doc, bytes);
  const list = sortByZ([...doc.getMap<Shape>("shapes").values()]);
  doc.destroy();
  return list;
}
