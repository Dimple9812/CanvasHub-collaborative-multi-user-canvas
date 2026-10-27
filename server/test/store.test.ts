import { afterAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { MemoryStore } from "../src/store/memory.js";
import { MongoStore } from "../src/store/mongo.js";
import type { Store } from "../src/store/types.js";

/**
 * The same contract runs against the in-memory store and, when MONGODB_URI_TEST is set
 * (as it is in CI, with a MongoDB service container), against a real MongoDB.
 */
const targets: [string, () => Promise<Store>][] = [["memory", async () => new MemoryStore()]];
if (process.env.MONGODB_URI_TEST) {
  targets.push(["mongo", () => MongoStore.connect(`${process.env.MONGODB_URI_TEST}/canvashub_test_${Date.now()}`)]);
}

const opened: Store[] = [];
afterAll(async () => {
  await Promise.all(opened.map((s) => s.close()));
});

describe.each(targets)("%s store", (_name, make) => {
  const get = async () => {
    const s = await make();
    opened.push(s);
    return s;
  };

  it("stores users with case-insensitive unique emails", async () => {
    const s = await get();
    const u = await s.createUser({ email: "Ada@Example.com", name: "Ada", passwordHash: "x", isDemo: false });
    expect((await s.findUserByEmail("ada@example.com"))?.id).toBe(u.id);
    await expect(s.createUser({ email: "ada@example.com", name: "Dup", passwordHash: "x", isDemo: false })).rejects.toMatchObject({ code: 11000 });
  });

  it("round-trips board state bytes and membership", async () => {
    const s = await get();
    const doc = new Y.Doc();
    doc.getMap("shapes").set("a", { id: "a" });
    const state = Y.encodeStateAsUpdate(doc);
    const b = await s.createBoard({ name: "B", ownerId: "o1", members: [], editInvite: "e".repeat(24), viewInvite: "v".repeat(24), state, shapeCount: 1 });

    const loaded = (await s.findBoard(b.id))!;
    const copy = new Y.Doc();
    Y.applyUpdate(copy, loaded.state!);
    expect(copy.getMap("shapes").get("a")).toEqual({ id: "a" });

    await s.addMember(b.id, { userId: "u2", role: "viewer" });
    await s.addMember(b.id, { userId: "u2", role: "editor" });
    await s.addMember(b.id, { userId: "u2", role: "viewer" });
    await s.addMember(b.id, { userId: "o1", role: "viewer" }); // owner is never added as a member
    expect((await s.findBoard(b.id))!.members).toEqual([{ userId: "u2", role: "editor" }]);
    expect((await s.listBoardsForUser("u2")).map((x) => x.id)).toEqual([b.id]);
  });

  it("deletes a board together with its versions", async () => {
    const s = await get();
    const b = await s.createBoard({ name: "B", ownerId: "o1", members: [], editInvite: "e".repeat(24), viewInvite: "v".repeat(24), state: null, shapeCount: 0 });
    const v = await s.createVersion({ boardId: b.id, name: "v1", state: new Uint8Array([0, 0]), shapeCount: 0, createdBy: "o1" });
    expect((await s.listVersions(b.id)).map((x) => x.id)).toEqual([v.id]);
    await s.deleteBoard(b.id);
    expect(await s.findBoard(b.id)).toBeNull();
    expect(await s.listVersions(b.id)).toEqual([]);
  });
});
