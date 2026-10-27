import * as Y from "yjs";
import { BoardSession, decodeShapes } from "./collab";
import type { Shape } from "./types";

const rect = (id: string, z = 1): Shape => ({
  id, type: "rect", x: 0, y: 0, width: 10, height: 10, rotation: 0, stroke: "#000", fill: "transparent", strokeWidth: 2, z,
});

// No start(): these tests exercise the local document and undo history without a server.
const session = () => new BoardSession({ boardId: "b1", getToken: async () => "t", persistLocal: false });

describe("BoardSession (local behaviour)", () => {
  it("keeps shapes sorted by z and notifies subscribers", () => {
    const s = session();
    const seen: number[] = [];
    s.subscribe(() => seen.push(s.getShapes().length));
    s.add(rect("b", 2));
    s.add(rect("a", 1));
    expect(s.getShapes().map((x) => x.id)).toEqual(["a", "b"]);
    expect(seen.at(-1)).toBe(2);
    expect(s.nextZ()).toBe(3);
  });

  it("undoes only local edits, not changes that arrive from others", () => {
    const s = session();
    s.add(rect("mine"));
    s.stopCapturing();

    // Simulate a collaborator's edit arriving over the network.
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(s.doc));
    remote.getMap<Shape>("shapes").set("theirs", rect("theirs", 5));
    Y.applyUpdate(s.doc, Y.encodeStateAsUpdate(remote, Y.encodeStateVector(s.doc)), Symbol("remote"));

    expect(s.getShapes()).toHaveLength(2);
    s.undo();
    expect(s.getShapes().map((x) => x.id)).toEqual(["theirs"]);
    s.redo();
    expect(s.getShapes()).toHaveLength(2);
  });

  it("merges rapid updates to one shape into a single undo step", () => {
    const s = session();
    s.add(rect("r"));
    s.stopCapturing();
    for (let x = 1; x <= 10; x++) s.update("r", { x }); // e.g. a drag
    expect(s.shapes.get("r")!.x).toBe(10);
    s.undo();
    expect(s.shapes.get("r")!.x).toBe(0);
  });

  it("restores a version in one undoable step", () => {
    const s = session();
    s.add(rect("a"));
    s.add(rect("b", 2));
    s.stopCapturing();
    const snapshot = btoa(String.fromCharCode(...Y.encodeStateAsUpdate(s.doc)));

    s.remove(["a", "b"]);
    s.add(rect("c"));
    s.stopCapturing();
    s.replaceAll(decodeShapes(snapshot));
    expect(s.getShapes().map((x) => x.id)).toEqual(["a", "b"]);
    s.undo();
    expect(s.getShapes().map((x) => x.id)).toEqual(["c"]);
  });

  it("ignores updates to shapes that no longer exist", () => {
    const s = session();
    s.update("ghost", { x: 5 });
    expect(s.shapes.has("ghost")).toBe(false);
  });
});
