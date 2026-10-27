import { useState } from "react";
import { Check, Copy, RotateCcw } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { toast } from "../../lib/toast";
import { api } from "../../lib/api";
import type { BoardDetails } from "../../lib/types";

export function ShareDialog({ board, onClose, onChange }: { board: BoardDetails; onClose: () => void; onChange: (b: BoardDetails) => void }) {
  const link = (token?: string) => (token ? `${location.origin}/join/${board.id}/${token}` : null);
  const edit = link(board.invites.edit);
  const view = link(board.invites.view);

  return (
    <Modal title="Share this board" onClose={onClose} width={520}>
      <p className="text-slate">Anyone with a link can open the board after signing in or continuing as a guest.</p>
      <div className="mt-4 space-y-3">
        {edit && <LinkRow label="Can edit" url={edit} />}
        {view && <LinkRow label="View only" url={view} />}
        {!edit && !view && <p className="text-sm text-slate">Only editors and the owner can share this board.</p>}
      </div>

      {board.members && board.members.length > 1 && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold">People on this board</h3>
          <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
            {board.members.map((m) => (
              <li key={m.userId} className="flex justify-between px-3 py-2 text-sm">
                <span>{m.name}</span>
                <span className="text-slate">{m.role === "owner" ? "Owner" : m.role === "editor" ? "Can edit" : "View only"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {board.role === "owner" && (
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
          <p className="text-sm text-slate">Reset links to stop anyone holding an old link from joining.</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              try {
                onChange(await api.rotateInvites(board.id));
                toast("Share links reset");
              } catch (e) {
                toast((e as Error).message, "error");
              }
            }}
          >
            <RotateCcw size={15} aria-hidden="true" /> <span className="whitespace-nowrap">Reset links</span>
          </Button>
        </div>
      )}
    </Modal>
  );
}

function LinkRow({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  const id = `link-${label.replace(/\s/g, "")}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold">{label}</label>
      <div className="flex gap-2">
        <input id={id} readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="h-9 min-w-0 flex-1 rounded-md border border-line bg-paper px-3 text-sm text-slate" />
        <Button
          size="sm"
          variant={copied ? "secondary" : "primary"}
          className="h-9"
          onClick={async () => {
            await navigator.clipboard.writeText(url).catch(() => undefined);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          }}
        >
          {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
    </div>
  );
}
