import { createServer } from "node:http";
import type { Config } from "./config.js";
import type { Store } from "./store/types.js";
import { MemoryStore } from "./store/memory.js";
import { MongoStore } from "./store/mongo.js";
import { RoomManager } from "./rooms.js";
import { createApp } from "./app.js";
import { attachRealtime } from "./realtime.js";

export async function createStore(config: Config): Promise<Store> {
  return config.store === "mongo" ? MongoStore.connect(config.mongoUri) : new MemoryStore();
}

/** Wires HTTP + sockets around one store. Used by index.ts and by the integration tests. */
export function buildServer(config: Config, store: Store) {
  const rooms = new RoomManager(store, config.persistDebounceMs);
  let realtime: ReturnType<typeof attachRealtime> | null = null;
  const app = createApp({ config, store, rooms, onBoardDeleted: (id) => realtime?.notifyBoardDeleted(id) });
  const http = createServer(app);
  realtime = attachRealtime(http, { config, store, rooms });

  async function close() {
    await new Promise<void>((resolve) => realtime!.io.close(() => resolve()));
    await rooms.flushAll();
    await store.close();
  }
  return { app, http, rooms, io: realtime.io, close };
}
