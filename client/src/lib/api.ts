import type { BoardDetails, BoardSummary, User, VersionSummary } from "./types";

/** Where the socket server lives. Empty = same origin (local dev proxy). */
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? "";

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Can't reach the server. Check your connection and try again.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const fallback = res.status >= 500 ? "The server is starting up or busy. Try again in a moment." : "Request failed.";
    throw new ApiError(res.status, data?.error ?? "HTTP_ERROR", data?.message ?? fallback);
  }
  return data as T;
}

export const api = {
  health: () => request<{ ok: boolean }>("GET", "/health"),
  me: () => request<{ user: User }>("GET", "/auth/me"),
  login: (email: string, password: string) => request<{ user: User }>("POST", "/auth/login", { email, password }),
  signup: (name: string, email: string, password: string) => request<{ user: User }>("POST", "/auth/signup", { name, email, password }),
  demo: () => request<{ user: User }>("POST", "/auth/demo"),
  logout: () => request<void>("POST", "/auth/logout"),
  socketToken: () => request<{ token: string }>("GET", "/auth/socket-token").then((r) => r.token),

  boards: () => request<{ boards: BoardSummary[] }>("GET", "/boards").then((r) => r.boards),
  board: (id: string) => request<{ board: BoardDetails }>("GET", `/boards/${id}`).then((r) => r.board),
  createBoard: (name: string) => request<{ board: BoardDetails }>("POST", "/boards", { name }).then((r) => r.board),
  renameBoard: (id: string, name: string) => request<{ board: BoardDetails }>("PATCH", `/boards/${id}`, { name }).then((r) => r.board),
  deleteBoard: (id: string) => request<void>("DELETE", `/boards/${id}`),
  rotateInvites: (id: string) => request<{ board: BoardDetails }>("POST", `/boards/${id}/invites/rotate`).then((r) => r.board),
  joinBoard: (id: string, invite: string) => request<{ board: BoardDetails }>("POST", `/boards/${id}/join`, { invite }).then((r) => r.board),

  versions: (id: string) => request<{ versions: VersionSummary[] }>("GET", `/boards/${id}/versions`).then((r) => r.versions),
  saveVersion: (id: string, name: string) => request<{ version: VersionSummary }>("POST", `/boards/${id}/versions`, { name }).then((r) => r.version),
  version: (id: string, vid: string) =>
    request<{ version: { id: string; name: string; state: string } }>("GET", `/boards/${id}/versions/${vid}`).then((r) => r.version),
};

/**
 * The free API host sleeps when idle and takes up to a minute to wake.
 * Polls /health so the UI can show "waking the server" instead of an error.
 */
export async function waitForServer(onWaiting: (secondsElapsed: number) => void, maxSeconds = 90): Promise<boolean> {
  const start = Date.now();
  for (;;) {
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    const elapsed = Math.round((Date.now() - start) / 1000);
    if (elapsed > maxSeconds) return false;
    onWaiting(elapsed);
    await new Promise((r) => setTimeout(r, 2000));
  }
}
