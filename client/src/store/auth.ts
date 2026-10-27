import { create } from "zustand";
import { api, ApiError } from "../lib/api";
import type { User } from "../lib/types";

interface AuthState {
  user: User | null;
  /** "unknown" until the first /me call settles. */
  status: "unknown" | "signed-in" | "signed-out";
  load: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  demo: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  status: "unknown",
  load: async () => {
    try {
      const { user } = await api.me();
      set({ user, status: "signed-in" });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) set({ user: null, status: "signed-out" });
      else throw e;
    }
  },
  login: async (email, password) => {
    const { user } = await api.login(email, password);
    set({ user, status: "signed-in" });
  },
  signup: async (name, email, password) => {
    const { user } = await api.signup(name, email, password);
    set({ user, status: "signed-in" });
  },
  demo: async () => {
    const { user } = await api.demo();
    set({ user, status: "signed-in" });
  },
  logout: async () => {
    await api.logout().catch(() => undefined);
    set({ user: null, status: "signed-out" });
  },
}));
