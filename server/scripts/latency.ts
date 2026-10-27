/**
 * Measures how long an edit takes to reach a second collaborator through the server.
 * Run: npm run bench  (starts an in-memory server on a random port)
 */
import * as Y from "yjs";
import request from "supertest";
import type { AddressInfo } from "node:net";
import { io } from "socket.io-client";
import { loadConfig } from "../src/config.js";
import { MemoryStore } from "../src/store/memory.js";
import { buildServer } from "../src/server.js";

const EDITS = Number(process.env.EDITS ?? 500);
const CLIENTS = Number(process.env.CLIENTS ?? 10);

const cfg = loadConfig({ NODE_ENV: "test", STORE: "memory", JWT_SECRET: "bench", PERSIST_DEBOUNCE_MS: "1500" });
const server = buildServer(cfg, new MemoryStore());
await new Promise<void>((r) => server.http.listen(0, r));
const url = `http://127.0.0.1:${(server.http.address() as AddressInfo).port}`;

const owner = request.agent(server.app);
await owner.post("/api/auth/signup").send({ email: "o@x.com", password: "benchmark", name: "Owner" });
const board = (await owner.post("/api/boards").send({ name: "Bench" })).body.board;

async function client(i: number) {
  const agent = i === 0 ? owner : request.agent(server.app);
  if (i > 0) {
    await agent.post("/api/auth/signup").send({ email: `u${i}@x.com`, password: "benchmark", name: `U${i}` });
    await agent.post(`/api/boards/${board.id}/join`).send({ invite: board.invites.edit });
  }
  const token = (await agent.get("/api/auth/socket-token")).body.token;
  const socket = io(url, { auth: { token }, transports: ["websocket"], forceNew: true });
  const doc = new Y.Doc();
  await new Promise<void>((resolve) => socket.on("connect", () => socket.emit("join", { boardId: board.id, stateVector: Y.encodeStateVector(doc) }, (res: any) => {
    Y.applyUpdate(doc, new Uint8Array(res.update), "remote");
    resolve();
  })));
  socket.on("update", (u: ArrayBuffer) => Y.applyUpdate(doc, new Uint8Array(u), "remote"));
  return { socket, doc };
}

const clients = await Promise.all(Array.from({ length: CLIENTS }, (_, i) => client(i)));
const [sender, ...receivers] = clients;
const latencies: number[] = [];

for (let i = 0; i < EDITS; i++) {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(sender.doc));
  const before = Y.encodeStateVector(doc);
  doc.getMap("shapes").set(`s${i}`, { id: `s${i}`, x: i, y: i });
  const update = Y.encodeStateAsUpdate(doc, before);
  Y.applyUpdate(sender.doc, update, "remote");

  const t0 = performance.now();
  const arrived = Promise.all(receivers.map((r) => new Promise<void>((res) => r.socket.once("update", () => res()))));
  sender.socket.emit("update", update);
  await arrived;
  latencies.push(performance.now() - t0);
  await new Promise((r) => setTimeout(r, 20)); // stay under the per-socket limit of 60 updates/s
}

latencies.sort((a, b) => a - b);
const pct = (p: number) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))].toFixed(2);
const converged = receivers.every((r) => r.doc.getMap("shapes").size === EDITS);
console.log(JSON.stringify({ edits: EDITS, receivers: receivers.length, p50ms: pct(0.5), p95ms: pct(0.95), p99ms: pct(0.99), converged }));

clients.forEach((c) => c.socket.disconnect());
await server.close();
process.exit(0);
