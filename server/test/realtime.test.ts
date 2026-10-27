import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import type { Socket } from "socket.io-client";
import { connect, emitAck, nextEvent, signupAgent, sleep, startServer } from "./helpers.js";
import { MemoryStore } from "../src/store/memory.js";

let srv: Awaited<ReturnType<typeof startServer>>;
const sockets: Socket[] = [];
beforeEach(async () => {
  srv = await startServer();
});
afterEach(async () => {
  sockets.splice(0).forEach((s) => s.disconnect());
  await srv.close();
});

/** Minimal version of the browser client: a Y.Doc kept in sync with the server. */
async function joinAsClient(token: string, boardId: string, doc = new Y.Doc()) {
  const socket = await connect(srv.url, token);
  sockets.push(socket);
  const res = await emitAck(socket, "join", { boardId, stateVector: Y.encodeStateVector(doc) });
  if (!res.ok) return { socket, doc, res };
  Y.applyUpdate(doc, new Uint8Array(res.update), "remote");
  const missing = Y.encodeStateAsUpdate(doc, new Uint8Array(res.stateVector));
  if (missing.length > 2) await emitAck(socket, "update", missing);
  socket.on("update", (u: ArrayBuffer) => Y.applyUpdate(doc, new Uint8Array(u), "remote"));
  doc.on("update", (u: Uint8Array, origin: unknown) => {
    if (origin !== "remote") socket.emit("update", u);
  });
  return { socket, doc, res };
}

const shapes = (d: Y.Doc) => d.getMap<any>("shapes");
const rect = (id: string, x = 0) => ({ id, type: "rect", x, y: 0, width: 10, height: 10, rotation: 0, stroke: "#000", fill: "#fff", strokeWidth: 1, z: 1 });

async function setup() {
  const owner = await signupAgent(srv.app, "Owner");
  const board = (await owner.agent.post("/api/boards").send({ name: "Live" })).body.board;
  return { owner, board };
}

describe("realtime sync", () => {
  it("rejects sockets without a valid token", async () => {
    await expect(connect(srv.url, "not-a-token")).rejects.toThrow("UNAUTHENTICATED");
  });

  it("refuses to join boards you are not a member of", async () => {
    const { board } = await setup();
    const stranger = await signupAgent(srv.app, "Stranger");
    const { res } = await joinAsClient(stranger.token, board.id);
    expect(res).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("syncs edits between two collaborators in both directions", async () => {
    const { owner, board } = await setup();
    const editor = await signupAgent(srv.app, "Editor");
    await editor.agent.post(`/api/boards/${board.id}/join`).send({ invite: board.invites.edit });

    const a = await joinAsClient(owner.token, board.id);
    const b = await joinAsClient(editor.token, board.id);

    const gotOnB = nextEvent(b.socket, "update");
    shapes(a.doc).set("r1", rect("r1"));
    await gotOnB;
    expect(shapes(b.doc).get("r1")).toMatchObject({ type: "rect" });

    const gotOnA = nextEvent(a.socket, "update");
    shapes(b.doc).set("r1", { ...rect("r1"), x: 99 });
    await gotOnA;
    expect(shapes(a.doc).get("r1").x).toBe(99);
  });

  it("merges edits made offline by two people when they reconnect", async () => {
    const { owner, board } = await setup();
    const editor = await signupAgent(srv.app, "Editor");
    await editor.agent.post(`/api/boards/${board.id}/join`).send({ invite: board.invites.edit });

    const a = await joinAsClient(owner.token, board.id);
    shapes(a.doc).set("shared", rect("shared"));
    await sleep(50);

    // Both go offline and keep drawing.
    const offlineA = new Y.Doc();
    Y.applyUpdate(offlineA, Y.encodeStateAsUpdate(a.doc));
    a.socket.disconnect();
    const offlineB = new Y.Doc();
    Y.applyUpdate(offlineB, Y.encodeStateAsUpdate(offlineA));
    shapes(offlineA).set("onlyA", rect("onlyA", 1));
    shapes(offlineB).set("onlyB", rect("onlyB", 2));
    shapes(offlineB).delete("shared");

    const a2 = await joinAsClient(owner.token, board.id, offlineA);
    const b2 = await joinAsClient(editor.token, board.id, offlineB);
    await sleep(100);

    for (const d of [a2.doc, b2.doc]) {
      expect([...shapes(d).keys()].sort()).toEqual(["onlyA", "onlyB"]);
    }
  });

  it("does not let viewers change the board", async () => {
    const { owner, board } = await setup();
    const viewer = await signupAgent(srv.app, "Viewer");
    await viewer.agent.post(`/api/boards/${board.id}/join`).send({ invite: board.invites.view });
    const v = await joinAsClient(viewer.token, board.id);
    expect(v.res.role).toBe("viewer");

    const doc = new Y.Doc();
    shapes(doc).set("evil", rect("evil"));
    const res = await emitAck(v.socket, "update", Y.encodeStateAsUpdate(doc));
    expect(res).toEqual({ ok: false, error: "READ_ONLY" });

    const o = await joinAsClient(owner.token, board.id);
    expect(shapes(o.doc).has("evil")).toBe(false);
  });

  it("broadcasts presence with server-assigned names and removes it on leave", async () => {
    const { owner, board } = await setup();
    const editor = await signupAgent(srv.app, "Grace");
    await editor.agent.post(`/api/boards/${board.id}/join`).send({ invite: board.invites.edit });
    const a = await joinAsClient(owner.token, board.id);
    const b = await joinAsClient(editor.token, board.id);

    const seen = new Promise<any>((resolve) =>
      a.socket.on("presence", (p: any) => p.cursor && resolve(p)),
    );
    b.socket.emit("presence", { cursor: { x: 10, y: 20 }, selection: ["r1"], name: "Spoofed" });
    const p = await seen;
    expect(p).toMatchObject({ name: "Grace", cursor: { x: 10, y: 20 }, selection: ["r1"] });

    const gone = nextEvent(a.socket, "presence-leave");
    b.socket.disconnect();
    expect((await gone).id).toBe(p.id);
  });

  it("persists the document after a quiet period and reloads it after a restart", async () => {
    const store = new MemoryStore();
    await srv.close();
    srv = await startServer(store);
    const { owner, board } = await setup();
    const a = await joinAsClient(owner.token, board.id);
    for (let i = 0; i < 20; i++) shapes(a.doc).set(`s${i}`, rect(`s${i}`, i)); // a burst of edits
    await sleep(150);
    expect(srv.rooms.persistCount).toBe(1); // debounced into a single write
    expect((await store.findBoard(board.id))!.shapeCount).toBe(20);

    a.socket.disconnect();
    await srv.close();
    srv = await startServer(store);
    // Same store and secret, so the owner's socket token is still valid after the "restart".
    const again = await joinAsClient(owner.token, board.id);
    expect(shapes(again.doc).size).toBe(20);
  });

  it("tells connected clients when the board is deleted", async () => {
    const { owner, board } = await setup();
    const a = await joinAsClient(owner.token, board.id);
    const deleted = nextEvent(a.socket, "board-deleted");
    await owner.agent.delete(`/api/boards/${board.id}`);
    expect(await deleted).toEqual({ boardId: board.id });
  });
});
