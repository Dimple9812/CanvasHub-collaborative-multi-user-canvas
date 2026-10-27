import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type Konva from "konva";
import { ArrowLeft, Download, History, Maximize, Minus, Plus, Redo2, Share2, Undo2 } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { useBoardSession, useHistory, usePeers, useSessionState, useShapes } from "../lib/useBoard";
import type { BoardSession } from "../lib/collab";
import { useEditor } from "../store/editor";
import { useAuth } from "../store/auth";
import { CanvasStage } from "../components/editor/CanvasStage";
import { Toolbar } from "../components/editor/Toolbar";
import { TOOLS } from "../lib/tools";
import { StylePanel } from "../components/editor/StylePanel";
import { ShareDialog } from "../components/editor/ShareDialog";
import { VersionsPanel } from "../components/editor/VersionsPanel";
import { Button } from "../components/ui/Button";
import { Toaster } from "../components/ui/Toast";
import { toast } from "../lib/toast";
import { NameDialog } from "./Dashboard";
import { fitViewport, shapeBounds, unionBounds, zoomAt } from "../lib/geometry";
import { duplicate } from "../lib/shapes";
import { exportPng } from "../lib/exportPng";
import { initials } from "../lib/format";
import type { BoardDetails, ConnectionStatus, Shape } from "../lib/types";

export default function BoardPage() {
  const { id = "" } = useParams();
  const user = useAuth((s) => s.user);
  const session = useBoardSession(id);
  const shapes = useShapes(session);
  const peers = usePeers(session);
  const state = useSessionState(session);
  const { canUndo, canRedo } = useHistory(session);
  const stageRef = useRef<Konva.Stage | null>(null);
  const [board, setBoard] = useState<BoardDetails | null>(null);
  const [loadError, setLoadError] = useState("");
  const [sharing, setSharing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const fitted = useRef(false);
  const viewport = useEditor((s) => s.viewport);
  const setViewport = useEditor((s) => s.setViewport);
  const resetEditor = useEditor((s) => s.reset);

  const canEdit = state.role ? state.role !== "viewer" : board ? board.role !== "viewer" : false;

  useEffect(() => {
    resetEditor();
    fitted.current = false;
    api.board(id).then(
      (b) => {
        setBoard(b);
        document.title = `${b.name} – CanvasHub`;
      },
      (e) => setLoadError((e as Error).message),
    );
    return () => {
      document.title = "CanvasHub – draw together in real time";
    };
  }, [id, resetEditor]);

  // Frame the existing content the first time it arrives.
  useEffect(() => {
    if (fitted.current || !shapes.length) return;
    fitted.current = true;
    const box = unionBounds(shapes.map(shapeBounds))!;
    setViewport(fitViewport(box, window.innerWidth, window.innerHeight, fitPadding()));
  }, [shapes, setViewport]);

  useKeyboardShortcuts(session, shapes, canEdit);

  if (loadError || state.status === "denied") {
    return (
      <main className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-2xl font-extrabold">{state.deleted ? "This board was deleted" : "Can't open this board"}</h1>
        <p className="max-w-sm text-slate">{state.deleted ? "The owner deleted it while you had it open." : loadError || "It doesn't exist or you don't have access."}</p>
        <Link to="/boards" className="font-semibold text-cobalt hover:underline">Go to your boards</Link>
      </main>
    );
  }

  const zoomBy = (factor: number) => setViewport(zoomAt(viewport, { x: window.innerWidth / 2, y: window.innerHeight / 2 }, viewport.scale * factor));
  const fit = () => {
    const box = unionBounds(shapes.map(shapeBounds));
    if (box) setViewport(fitViewport(box, window.innerWidth, window.innerHeight, fitPadding()));
    else setViewport({ x: 0, y: 0, scale: 1 });
  };

  return (
    <div className="relative h-full overflow-hidden">
      <h1 className="sr-only">{board?.name ?? "Board"}</h1>
      {session && <CanvasStage session={session} shapes={shapes} peers={peers} canEdit={canEdit} stageRef={stageRef} />}

      {/* Floating chrome. The wrapper ignores the pointer so the canvas stays usable around the panels. */}
      <div className="pointer-events-none absolute inset-0">
        <header className="pointer-events-auto absolute left-4 right-4 top-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1 rounded-xl border border-line bg-white p-1 shadow-float">
            <Link to="/boards" aria-label="Back to your boards" className="grid h-9 w-9 place-items-center rounded-lg text-ink hover:bg-ink/5">
              <ArrowLeft size={18} />
            </Link>
            <button
              type="button"
              onClick={() => canEdit && setRenaming(true)}
              disabled={!canEdit}
              title={canEdit ? "Rename board" : undefined}
              className="max-w-[40vw] truncate rounded-lg px-2 py-1.5 font-bold enabled:hover:bg-ink/5 disabled:cursor-default"
            >
              {board?.name ?? "Loading…"}
            </button>
            <StatusBadge status={state.status} role={state.role} />
          </div>

          <div className="flex items-center gap-2">
            <Presence you={state.you ?? (user ? { name: user.name, color: "#1c2433" } : null)} peers={peers} />
            <div className="flex items-center gap-1 rounded-xl border border-line bg-white p-1 shadow-float">
              <IconButton label="Download as PNG" onClick={() => stageRef.current && (exportPng(stageRef.current, shapes, viewport, board?.name ?? "board") || toast("The board is empty — nothing to export."))}>
                <Download size={18} />
              </IconButton>
              <IconButton label="Versions" pressed={showVersions} onClick={() => setShowVersions((v) => !v)}>
                <History size={18} />
              </IconButton>
              {board && (board.role !== "viewer") && (
                <Button size="sm" className="ml-1 h-9" onClick={() => setSharing(true)}>
                  <Share2 size={16} aria-hidden="true" /> Share
                </Button>
              )}
            </div>
          </div>
        </header>

        {session && canEdit && <StylePanel session={session} shapes={shapes} />}
        <Toolbar canEdit={canEdit} />

        <div className="pointer-events-auto absolute bottom-20 left-4 flex items-center gap-0.5 rounded-xl sm:bottom-4 border border-line bg-white p-1 shadow-float">
          <IconButton label="Undo (Ctrl+Z)" disabled={!canEdit || !canUndo} onClick={() => session?.undo()}>
            <Undo2 size={18} />
          </IconButton>
          <IconButton label="Redo (Ctrl+Shift+Z)" disabled={!canEdit || !canRedo} onClick={() => session?.redo()}>
            <Redo2 size={18} />
          </IconButton>
        </div>

        <div className="pointer-events-auto absolute bottom-20 right-4 flex items-center gap-0.5 rounded-xl sm:bottom-4 border border-line bg-white p-1 shadow-float">
          <IconButton label="Zoom out" onClick={() => zoomBy(1 / 1.2)}><Minus size={18} /></IconButton>
          <button type="button" onClick={() => setViewport(zoomAt(viewport, { x: window.innerWidth / 2, y: window.innerHeight / 2 }, 1))} className="h-9 w-14 rounded-lg text-sm font-semibold tabular-nums hover:bg-ink/5" aria-label="Reset zoom to 100%">
            {Math.round(viewport.scale * 100)}%
          </button>
          <IconButton label="Zoom in" onClick={() => zoomBy(1.2)}><Plus size={18} /></IconButton>
          <IconButton label="Fit to content (Shift+1)" onClick={fit}><Maximize size={17} /></IconButton>
        </div>

        {showVersions && session && <VersionsPanel boardId={id} session={session} canEdit={canEdit} onClose={() => setShowVersions(false)} />}
      </div>

      {sharing && board && <ShareDialog board={board} onClose={() => setSharing(false)} onChange={setBoard} />}
      {renaming && board && (
        <NameDialog
          title="Rename board"
          initial={board.name}
          action="Rename"
          onClose={() => setRenaming(false)}
          onSubmit={async (name) => {
            setBoard({ ...board, ...(await api.renameBoard(board.id, name)) });
            setRenaming(false);
          }}
        />
      )}
      <Toaster />
    </div>
  );
}

function IconButton({ label, onClick, disabled, pressed, children }: { label: string; onClick: () => void; disabled?: boolean; pressed?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={clsx("grid h-9 w-9 place-items-center rounded-lg transition-colors disabled:text-slate/40", pressed ? "bg-cobalt-soft text-cobalt" : "text-ink enabled:hover:bg-ink/5")}
    >
      {children}
    </button>
  );
}

const STATUS: Record<ConnectionStatus, { text: string; dot: string }> = {
  connecting: { text: "Connecting", dot: "bg-slate" },
  live: { text: "Live", dot: "bg-emerald-500" },
  reconnecting: { text: "Reconnecting — edits saved here", dot: "bg-amber-500" },
  offline: { text: "Offline — edits saved here", dot: "bg-amber-500" },
  denied: { text: "No access", dot: "bg-danger" },
};

function StatusBadge({ status, role }: { status: ConnectionStatus; role: string | null }) {
  const s = STATUS[status];
  return (
    <span role="status" className="hidden items-center gap-1.5 whitespace-nowrap px-2 text-xs font-semibold text-slate sm:inline-flex">
      <span className={clsx("h-2 w-2 rounded-full", s.dot)} aria-hidden="true" />
      {s.text}
      {role === "viewer" && <span className="ml-1 rounded bg-ink/5 px-1.5 py-0.5 text-ink">View only</span>}
    </span>
  );
}

function Presence({ you, peers }: { you: { name: string; color: string } | null; peers: { id: string; name: string; color: string }[] }) {
  const people = [...(you ? [{ id: "you", name: `${you.name} (you)`, color: you.color }] : []), ...peers];
  const shown = people.slice(0, 5);
  return (
    <div className="flex -space-x-2" aria-label={`${people.length} ${people.length === 1 ? "person" : "people"} on this board`}>
      {shown.map((p) => (
        <span
          key={p.id}
          title={p.name}
          className="grid h-9 w-9 place-items-center rounded-full border-2 border-white text-xs font-bold text-white shadow-sm"
          style={{ background: p.color }}
        >
          {initials(p.name.replace(" (you)", ""))}
        </span>
      ))}
      {people.length > shown.length && (
        <span className="grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-ink text-xs font-bold text-white">+{people.length - shown.length}</span>
      )}
    </div>
  );
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

function useKeyboardShortcuts(session: BoardSession | null, shapes: Shape[], canEdit: boolean) {
  const shapesRef = useRef(shapes);
  useLayoutEffect(() => {
    shapesRef.current = shapes;
  });

  useEffect(() => {
    if (!session) return;
    const ed = useEditor.getState;
    const onDown = (e: KeyboardEvent) => {
      if (isTyping(e.target) || document.querySelector('[role="dialog"]')) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const { selection, setSelection, setTool, viewport, setViewport } = ed();

      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        ed().startTemporaryPan();
        return;
      }
      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) session.redo();
        else session.undo();
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        session.redo();
        return;
      }
      if (mod && key === "a") {
        e.preventDefault();
        setTool("select");
        setSelection(shapesRef.current.map((s) => s.id));
        return;
      }
      if (mod && key === "d" && canEdit && selection.length) {
        e.preventDefault();
        const copies = duplicate(shapesRef.current.filter((s) => selection.includes(s.id)), session.nextZ());
        session.stopCapturing();
        copies.forEach((c) => session.add(c));
        setSelection(copies.map((c) => c.id));
        return;
      }
      if (mod && (key === "=" || key === "+" || key === "-")) {
        e.preventDefault();
        const f = key === "-" ? 1 / 1.2 : 1.2;
        setViewport(zoomAt(viewport, { x: window.innerWidth / 2, y: window.innerHeight / 2 }, viewport.scale * f));
        return;
      }
      if (e.shiftKey && e.code === "Digit1") {
        const box = unionBounds(shapesRef.current.map(shapeBounds));
        if (box) setViewport(fitViewport(box, window.innerWidth, window.innerHeight, fitPadding()));
        return;
      }
      if (mod) return;

      if ((key === "delete" || key === "backspace") && canEdit && selection.length) {
        e.preventDefault();
        session.stopCapturing();
        session.remove(selection);
        setSelection([]);
        return;
      }
      if (key === "escape") {
        setSelection([]);
        setTool("select");
        return;
      }
      if (key.startsWith("arrow") && canEdit && selection.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const d = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] }[key] ?? [0, 0];
        const byId = new Map(shapesRef.current.map((s) => [s.id, s]));
        session.updateMany(selection.filter((sid) => byId.has(sid)).map((sid) => [sid, { x: byId.get(sid)!.x + d[0], y: byId.get(sid)!.y + d[1] }]));
        return;
      }
      const tool = TOOLS.find((t) => t.key.toLowerCase() === key);
      if (tool && (canEdit || tool.tool === "select" || tool.tool === "hand")) setTool(tool.tool);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === "Space") ed().endTemporaryPan();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [session, canEdit]);
}

/** Less breathing room around the content on small screens. */
const fitPadding = () => Math.min(120, Math.round(window.innerWidth * 0.06));
