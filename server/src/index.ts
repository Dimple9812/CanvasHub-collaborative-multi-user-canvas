import { loadConfig } from "./config.js";
import { buildServer, createStore } from "./server.js";

const config = loadConfig();
const store = await createStore(config);
const server = buildServer(config, store);

server.http.listen(config.port, () => {
  console.log(`CanvasHub server on :${config.port} (store: ${config.store}, origins: ${config.clientOrigins.join(", ")})`);
});

// Save every open board before the process exits (deploys, restarts).
let shuttingDown = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, saving open boards…`);
    await server.close();
    process.exit(0);
  });
}
