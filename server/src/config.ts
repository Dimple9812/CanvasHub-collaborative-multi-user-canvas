export interface Config {
  port: number;
  nodeEnv: string;
  /** "mongo" in production; "memory" for local demos and tests. */
  store: "mongo" | "memory";
  mongoUri: string;
  jwtSecret: string;
  /** Comma-separated list of browser origins allowed to open a socket. */
  clientOrigins: string[];
  /** How long to wait after the last edit before writing a board to the database. */
  persistDebounceMs: number;
  cookieSecure: boolean;
  /** Sign-in/sign-up/demo attempts allowed per IP per minute. */
  authRateLimit: number;
  /** Number of proxies in front of the server (Render + Vercel rewrite = 2), so rate limits see the real client IP. */
  trustProxyHops: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const nodeEnv = env.NODE_ENV ?? "development";
  const store = (env.STORE ?? (env.MONGODB_URI ? "mongo" : "memory")) as Config["store"];
  const jwtSecret = env.JWT_SECRET ?? (nodeEnv === "production" ? "" : "dev-only-secret-change-me");
  if (!jwtSecret) throw new Error("JWT_SECRET must be set in production");
  if (store === "mongo" && !env.MONGODB_URI) throw new Error("MONGODB_URI must be set when STORE=mongo");

  return {
    port: Number(env.PORT ?? 4000),
    nodeEnv,
    store,
    mongoUri: env.MONGODB_URI ?? "",
    jwtSecret,
    clientOrigins: (env.CLIENT_ORIGIN ?? "http://localhost:5173")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    persistDebounceMs: Number(env.PERSIST_DEBOUNCE_MS ?? 1500),
    trustProxyHops: Number(env.TRUST_PROXY_HOPS ?? 1),
    authRateLimit: Number(env.AUTH_RATE_LIMIT ?? (nodeEnv === "test" ? 1000 : 20)),
    cookieSecure: (env.COOKIE_SECURE ?? (nodeEnv === "production" ? "true" : "false")) === "true",
  };
}
