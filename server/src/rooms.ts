import * as Y from "yjs";
import type { Store } from "./store/types.js";
import { shapeCount } from "./shapes.js";

interface Room {
  boardId: string;
  doc: Y.Doc;
  connections: Set<string>;
  dirty: boolean;
  timer: NodeJS.Timeout | null;
  saving: Promise<void> | null;
}

/**
 * Keeps one live Y.Doc per open board. Edits are applied in memory immediately and
 * written to the database after a short quiet period, so a burst of drag events
 * costs one write instead of hundreds.
 */
export class RoomManager {
  private rooms = new Map<string, Room>();
  private loading = new Map<string, Promise<Room>>();
  /** Number of database writes performed; exposed for tests and metrics. */
  persistCount = 0;

  constructor(private store: Store, private debounceMs: number) {}

  async open(boardId: string, connectionId: string): Promise<Y.Doc> {
    const room = await this.load(boardId);
    room.connections.add(connectionId);
    return room.doc;
  }

  /** Returns the live document if the board is open, without opening it. */
  peek(boardId: string): Y.Doc | null {
    return this.rooms.get(boardId)?.doc ?? null;
  }

  /** Current state for snapshots: live state if open, otherwise what's stored. */
  async currentState(boardId: string): Promise<{ state: Uint8Array; shapeCount: number } | null> {
    const live = this.peek(boardId);
    if (live) return { state: Y.encodeStateAsUpdate(live), shapeCount: shapeCount(live) };
    const board = await this.store.findBoard(boardId);
    if (!board) return null;
    const doc = new Y.Doc();
    if (board.state) Y.applyUpdate(doc, board.state);
    return { state: Y.encodeStateAsUpdate(doc), shapeCount: shapeCount(doc) };
  }

  apply(boardId: string, update: Uint8Array, origin: string) {
    const room = this.rooms.get(boardId);
    if (!room) throw new Error("room not open");
    Y.applyUpdate(room.doc, update, origin);
    this.markDirty(room);
  }

  async leave(boardId: string, connectionId: string) {
    const room = this.rooms.get(boardId);
    if (!room) return;
    room.connections.delete(connectionId);
    if (room.connections.size === 0) {
      await this.flush(boardId);
      // Someone may have rejoined while we were saving.
      if (room.connections.size === 0 && !room.dirty) {
        room.doc.destroy();
        this.rooms.delete(boardId);
      }
    }
  }

  /** Drops a board from memory without saving (used after deletion). */
  discard(boardId: string) {
    const room = this.rooms.get(boardId);
    if (!room) return;
    if (room.timer) clearTimeout(room.timer);
    room.doc.destroy();
    this.rooms.delete(boardId);
  }

  async flush(boardId: string) {
    const room = this.rooms.get(boardId);
    if (!room) return;
    if (room.timer) {
      clearTimeout(room.timer);
      room.timer = null;
    }
    await room.saving;
    if (!room.dirty) return;
    room.dirty = false;
    room.saving = this.store
      .updateBoard(boardId, { state: Y.encodeStateAsUpdate(room.doc), shapeCount: shapeCount(room.doc) })
      .then(() => {
        this.persistCount++;
      })
      .catch((err) => {
        room.dirty = true; // retry on the next edit or flush
        console.error(`[rooms] failed to save board ${boardId}:`, err);
      })
      .finally(() => {
        room.saving = null;
      });
    await room.saving;
  }

  async flushAll() {
    await Promise.all([...this.rooms.keys()].map((id) => this.flush(id)));
  }

  stats() {
    let connections = 0;
    for (const r of this.rooms.values()) connections += r.connections.size;
    return { openBoards: this.rooms.size, connections, persistCount: this.persistCount };
  }

  private markDirty(room: Room) {
    room.dirty = true;
    if (room.timer) clearTimeout(room.timer);
    room.timer = setTimeout(() => {
      room.timer = null;
      void this.flush(room.boardId);
    }, this.debounceMs);
  }

  private async load(boardId: string): Promise<Room> {
    const existing = this.rooms.get(boardId);
    if (existing) return existing;
    const pending = this.loading.get(boardId);
    if (pending) return pending;

    const p = (async () => {
      const board = await this.store.findBoard(boardId);
      if (!board) throw new Error("BOARD_NOT_FOUND");
      const doc = new Y.Doc();
      if (board.state) Y.applyUpdate(doc, board.state);
      const room: Room = { boardId, doc, connections: new Set(), dirty: false, timer: null, saving: null };
      this.rooms.set(boardId, room);
      return room;
    })();
    this.loading.set(boardId, p);
    try {
      return await p;
    } finally {
      this.loading.delete(boardId);
    }
  }
}
