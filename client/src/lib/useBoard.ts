import { useEffect, useState, useSyncExternalStore } from "react";
import { BoardSession } from "./collab";
import { api, SOCKET_URL } from "./api";

/** Creates the live session for a board and tears it down when the page unmounts. */
export function useBoardSession(boardId: string) {
  const [session, setSession] = useState<BoardSession | null>(null);
  useEffect(() => {
    const s = new BoardSession({ boardId, getToken: api.socketToken, socketUrl: SOCKET_URL });
    void s.start();
    // Publishing the external object to React is what this effect is for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession(s);
    return () => s.destroy();
  }, [boardId]);
  return session;
}

const noop = () => () => {};
const empty: never[] = [];

export function useShapes(session: BoardSession | null) {
  return useSyncExternalStore(session?.subscribe ?? noop, session?.getShapes ?? (() => empty));
}

export function usePeers(session: BoardSession | null) {
  return useSyncExternalStore(session?.subscribe ?? noop, session?.getPeers ?? (() => empty));
}

const initialState = { status: "connecting", role: null, you: null, deleted: false } as const;
export function useSessionState(session: BoardSession | null) {
  return useSyncExternalStore(session?.subscribe ?? noop, session?.getState ?? (() => initialState));
}

/** Re-renders when undo/redo availability changes. */
export function useHistory(session: BoardSession | null) {
  useSyncExternalStore(session?.subscribe ?? noop, () => `${session?.canUndo}:${session?.canRedo}`);
  return { canUndo: !!session?.canUndo, canRedo: !!session?.canRedo };
}
