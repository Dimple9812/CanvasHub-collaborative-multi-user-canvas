/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const API = process.env.API_URL ?? "http://localhost:4000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": API,
      "/socket.io": { target: API, ws: true },
    },
  },
  preview: {
    proxy: {
      "/api": API,
      "/socket.io": { target: API, ws: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Keep the canvas engine out of the landing page bundle.
        manualChunks(id) {
          if (id.includes("konva")) return "canvas";
          if (id.includes("yjs") || id.includes("y-indexeddb") || id.includes("lib0") || id.includes("socket.io")) return "sync";
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
