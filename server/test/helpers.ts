import type { AddressInfo } from "node:net";
import request from "supertest";
import { io as ioClient, type Socket } from "socket.io-client";
import { loadConfig } from "../src/config.js";
import { MemoryStore } from "../src/store/memory.js";
import { buildServer } from "../src/server.js";

export function testConfig(overrides: Record<string, string> = {}) {
  return loadConfig({ NODE_ENV: "test", STORE: "memory", JWT_SECRET: "test-secret", PERSIST_DEBOUNCE_MS: "30", ...overrides });
}

export async function startServer(store = new MemoryStore(), cfg = testConfig()) {
  const server = buildServer(cfg, store);
  await new Promise<void>((r) => server.http.listen(0, r));
  const port = (server.http.address() as AddressInfo).port;
  return { ...server, store, url: `http://127.0.0.1:${port}` };
}

/** Signs up through the API and returns a cookie-carrying agent plus a socket token. */
export async function signupAgent(app: Parameters<typeof request.agent>[0], name = "Ada") {
  const agent = request.agent(app);
  const email = `${name.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const res = await agent.post("/api/auth/signup").send({ email, password: "correct horse", name });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  const token = (await agent.get("/api/auth/socket-token")).body.token as string;
  return { agent, user: res.body.user as { id: string; name: string }, token, email };
}

export function connect(url: string, token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = ioClient(url, { auth: { token }, transports: ["websocket"], forceNew: true, reconnection: false });
    s.once("connect", () => resolve(s));
    s.once("connect_error", reject);
  });
}

export const emitAck = <T = any>(s: Socket, event: string, payload: unknown): Promise<T> =>
  new Promise((resolve) => s.emit(event, payload, resolve));

export const nextEvent = <T = any>(s: Socket, event: string, timeoutMs = 2000): Promise<T> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs);
    s.once(event, (data: T) => {
      clearTimeout(t);
      resolve(data);
    });
  });

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
