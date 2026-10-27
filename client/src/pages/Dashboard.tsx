import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogOut, MoreHorizontal, Plus } from "lucide-react";
import { Logo } from "../components/ui/Logo";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Toaster } from "../components/ui/Toast";
import { toast } from "../lib/toast";
import { useAuth } from "../store/auth";
import { api } from "../lib/api";
import { timeAgo } from "../lib/format";
import type { BoardSummary } from "../lib/types";

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<BoardSummary | null>(null);
  const [deleting, setDeleting] = useState<BoardSummary | null>(null);

  const refresh = () =>
    api.boards().then(setBoards, (e) => setError((e as Error).message));

  useEffect(() => {
    void refresh();
  }, []);

  const create = async (name: string) => {
    const board = await api.createBoard(name);
    navigate(`/b/${board.id}`);
  };

  return (
    <div className="min-h-full">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
          <Logo to="/boards" />
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate sm:inline">
              {user?.name}
              {user?.isDemo && " (guest)"}
            </span>
            <Button variant="ghost" size="sm" onClick={() => logout().then(() => navigate("/"))}>
              <LogOut size={16} aria-hidden="true" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-5xl px-5 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Your boards</h1>
            <p className="mt-1 text-slate">Boards you own and boards people have shared with you.</p>
          </div>
          <Button onClick={() => setCreating(true)}>
            <Plus size={18} aria-hidden="true" /> New board
          </Button>
        </div>

        {error && <p role="alert" className="mt-6 text-danger">{error}</p>}
        {!boards && !error && <p className="mt-10 text-slate">Loading boards…</p>}
        {boards?.length === 0 && (
          <div className="mt-10 rounded-xl border border-dashed border-line bg-white px-6 py-12 text-center">
            <p className="text-lg font-semibold">No boards yet</p>
            <p className="mt-1 text-slate">Create one, then share its link to draw with someone.</p>
            <Button className="mt-5" onClick={() => setCreating(true)}>Create a board</Button>
          </div>
        )}

        {!!boards?.length && (
          <ul className="mt-8 divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
            {boards.map((b) => (
              <li key={b.id} className="group flex items-center gap-4 px-4 py-3.5 hover:bg-paper">
                <BoardGlyph count={b.shapeCount} />
                <div className="min-w-0 flex-1">
                  <Link to={`/b/${b.id}`} className="block truncate font-semibold hover:text-cobalt">
                    {b.name}
                  </Link>
                  <p className="text-sm text-slate">
                    {b.role === "owner" ? "Yours" : `Shared by ${b.ownerName}, ${b.role === "editor" ? "you can edit" : "view only"}`}. Edited{" "}
                    {timeAgo(b.updatedAt)}. {b.shapeCount} {b.shapeCount === 1 ? "shape" : "shapes"}.
                  </p>
                </div>
                {b.role !== "viewer" && (
                  <RowMenu
                    canDelete={b.role === "owner"}
                    onRename={() => setRenaming(b)}
                    onDelete={() => setDeleting(b)}
                    label={b.name}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </main>

      {creating && (
        <NameDialog title="New board" initial="Untitled board" action="Create board" onClose={() => setCreating(false)} onSubmit={create} />
      )}
      {renaming && (
        <NameDialog
          title="Rename board"
          initial={renaming.name}
          action="Rename"
          onClose={() => setRenaming(null)}
          onSubmit={async (name) => {
            await api.renameBoard(renaming.id, name);
            setRenaming(null);
            toast("Board renamed");
            void refresh();
          }}
        />
      )}
      {deleting && (
        <Modal title="Delete board?" onClose={() => setDeleting(null)}>
          <p className="text-slate">
            “{deleting.name}” and its saved versions will be deleted for everyone it's shared with. This can't be undone.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={async () => {
                await api.deleteBoard(deleting.id).catch((e) => toast((e as Error).message, "error"));
                setDeleting(null);
                toast("Board deleted");
                void refresh();
              }}
            >
              Delete board
            </Button>
          </div>
        </Modal>
      )}
      <Toaster />
    </div>
  );
}

function BoardGlyph({ count }: { count: number }) {
  // A tiny abstract preview whose density hints at how full the board is.
  const n = Math.min(4, Math.ceil(count / 3));
  const colors = ["#ffd84d", "#2f5bea", "#a7f3d0", "#fecdd3"];
  return (
    <span aria-hidden="true" className="dot-grid relative h-11 w-14 shrink-0 rounded-md border border-line" style={{ backgroundSize: "8px 8px" }}>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="absolute rounded-[2px]" style={{ background: colors[i], width: 12, height: 9, left: 6 + (i % 2) * 22, top: 7 + Math.floor(i / 2) * 15 }} />
      ))}
    </span>
  );
}

function RowMenu({ onRename, onDelete, canDelete, label }: { onRename: () => void; onDelete: () => void; canDelete: boolean; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Actions for ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onBlur={(e) => !e.currentTarget.parentElement?.contains(e.relatedTarget) && setOpen(false)}
        className="rounded-md p-2 text-slate hover:bg-ink/5 hover:text-ink"
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-10 z-10 w-36 rounded-lg border border-line bg-white py-1 shadow-float">
          <button type="button" role="menuitem" className="block w-full px-3 py-2 text-left text-sm hover:bg-paper" onClick={() => { setOpen(false); onRename(); }}>
            Rename
          </button>
          {canDelete && (
            <button type="button" role="menuitem" className="block w-full px-3 py-2 text-left text-sm text-danger hover:bg-paper" onClick={() => { setOpen(false); onDelete(); }}>
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function NameDialog({
  title, initial, action, onClose, onSubmit,
}: { title: string; initial: string; action: string; onClose: () => void; onSubmit: (name: string) => Promise<void> }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name")).trim();
    if (!name) return setError("Give the board a name.");
    setBusy(true);
    try {
      await onSubmit(name);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit}>
        <label htmlFor="board-name" className="mb-1.5 block text-sm font-semibold">Board name</label>
        <input
          id="board-name"
          name="name"
          defaultValue={initial}
          maxLength={80}
          onFocus={(e) => e.currentTarget.select()}
          className="h-10 w-full rounded-md border border-line px-3 outline-none focus:border-cobalt"
        />
        {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{action}</Button>
        </div>
      </form>
    </Modal>
  );
}
