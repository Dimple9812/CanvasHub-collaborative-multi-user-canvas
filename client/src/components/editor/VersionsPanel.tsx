import { useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { Button } from "../ui/Button";
import { toast } from "../../lib/toast";
import { api } from "../../lib/api";
import { decodeShapes, type BoardSession } from "../../lib/collab";
import { timeAgo } from "../../lib/format";
import type { VersionSummary } from "../../lib/types";

/** Named snapshots. Restoring is one undoable change that everyone on the board sees. */
export function VersionsPanel({ boardId, session, canEdit, onClose }: { boardId: string; session: BoardSession; canEdit: boolean; onClose: () => void }) {
  const [versions, setVersions] = useState<VersionSummary[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.versions(boardId).then(setVersions, (e) => toast((e as Error).message, "error"));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const name = String(new FormData(form).get("name")).trim() || `Version ${new Date().toLocaleString()}`;
    setBusy(true);
    try {
      await api.saveVersion(boardId, name);
      form.reset();
      toast("Version saved");
      await load();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const restore = async (v: VersionSummary) => {
    try {
      const full = await api.version(boardId, v.id);
      session.stopCapturing();
      session.replaceAll(decodeShapes(full.state));
      session.stopCapturing();
      toast(`Restored “${v.name}”. Press Ctrl+Z to undo.`);
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  return (
    <aside aria-label="Versions" className="pointer-events-auto absolute bottom-4 right-4 top-20 flex w-80 flex-col rounded-xl border border-line bg-white shadow-float">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="font-bold">Versions</h2>
        <button type="button" aria-label="Close versions" onClick={onClose} className="rounded-md p-1.5 text-slate hover:bg-ink/5 hover:text-ink">
          <X size={18} />
        </button>
      </div>
      {canEdit && (
        <form onSubmit={save} className="flex gap-2 border-b border-line p-3">
          <label htmlFor="version-name" className="sr-only">Version name</label>
          <input id="version-name" name="name" maxLength={80} placeholder="Name this version" className="h-9 min-w-0 flex-1 rounded-md border border-line px-3 text-sm outline-none focus:border-cobalt" />
          <Button type="submit" size="sm" className="h-9" disabled={busy}>Save</Button>
        </form>
      )}
      <div className="flex-1 overflow-y-auto">
        {!versions && <p className="p-4 text-sm text-slate">Loading…</p>}
        {versions?.length === 0 && <p className="p-4 text-sm text-slate">No saved versions yet. Save one before a big change so you can come back to it.</p>}
        <ul>
          {versions?.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-2 border-b border-line px-4 py-3 last:border-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{v.name}</p>
                <p className="text-xs text-slate">
                  {v.createdBy}, {timeAgo(v.createdAt)}. {v.shapeCount} shapes.
                </p>
              </div>
              {canEdit && (
                <Button variant="secondary" size="sm" onClick={() => restore(v)}>
                  Restore
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
