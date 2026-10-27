import { BringToFront, Copy, Trash2 } from "lucide-react";
import clsx from "clsx";
import type { BoardSession } from "../../lib/collab";
import type { Shape } from "../../lib/types";
import { FILLS, STICKY_FILLS, STROKES, WIDTHS, useEditor } from "../../store/editor";
import { duplicate, hasFill, isPointShape } from "../../lib/shapes";

const NAMES: Record<string, string> = {
  "#1c2433": "Ink", "#2f5bea": "Cobalt", "#e11d48": "Red", "#16a34a": "Green", "#d97706": "Amber", "#7c3aed": "Violet",
  transparent: "No fill", "#ffffff": "White", "#dbe4ff": "Light blue", "#ffe0e6": "Light pink", "#d9f5e1": "Light green", "#fff1c2": "Light yellow",
  "#ffd84d": "Yellow", "#a7f3d0": "Mint", "#bfdbfe": "Sky", "#fecdd3": "Rose", "#ddd6fe": "Lilac",
};

/**
 * Styles for the selection, or for the next shape when a drawing tool is active.
 * Changing a swatch with shapes selected restyles them for everyone.
 */
export function StylePanel({ session, shapes }: { session: BoardSession; shapes: Shape[] }) {
  const { tool, style, selection, setStyle, setSelection } = useEditor();
  const selected = shapes.filter((s) => selection.includes(s.id));
  const types = new Set(selected.length ? selected.map((s) => s.type) : tool !== "select" && tool !== "hand" ? [tool] : []);
  if (!types.size) return null;

  const first = selected[0];
  const current = {
    stroke: first?.stroke ?? style.stroke,
    fill: first?.fill ?? style.fill,
    strokeWidth: first?.strokeWidth ?? style.strokeWidth,
  };
  const only = (pred: (t: Shape["type"]) => boolean) => [...types].every(pred);
  const any = (pred: (t: Shape["type"]) => boolean) => [...types].some(pred);

  const apply = (patch: Partial<Pick<Shape, "stroke" | "strokeWidth">>) => {
    setStyle(patch);
    if (selected.length) {
      session.stopCapturing();
      session.updateMany(selected.map((s) => [s.id, patch]));
    }
  };
  const applyFill = (fill: string) => {
    setStyle({ fill });
    if (selected.length) session.updateMany(selected.filter((s) => s.type === "sticky" || hasFill(s.type)).map((s) => [s.id, { fill }]));
  };

  return (
    <aside
      aria-label="Style"
      className="pointer-events-auto absolute left-4 top-20 hidden w-52 sm:block space-y-4 rounded-xl border border-line bg-white p-3.5 shadow-float"
    >
      {!only((t) => t === "sticky") && (
        <Swatches label={any((t) => t === "text") && only((t) => t === "text") ? "Text colour" : "Stroke"} options={STROKES} value={current.stroke} onPick={(stroke) => apply({ stroke })} />
      )}
      {any(hasFill) && <Swatches label="Fill" options={FILLS} value={current.fill} onPick={applyFill} />}
      {any((t) => t === "sticky") && <Swatches label="Note colour" options={STICKY_FILLS} value={current.fill} onPick={applyFill} />}
      {any((t) => hasFill(t) || isPointShape(t)) && (
        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold text-slate">Stroke width</legend>
          <div className="flex gap-1">
            {WIDTHS.map((w) => (
              <button
                key={w}
                type="button"
                aria-label={`${w}px`}
                aria-pressed={current.strokeWidth === w}
                onClick={() => apply({ strokeWidth: w })}
                className={clsx("grid h-8 flex-1 place-items-center rounded-md", current.strokeWidth === w ? "bg-cobalt-soft" : "hover:bg-ink/5")}
              >
                <span className="w-5 rounded-full bg-ink" style={{ height: Math.max(1, w * 0.75) }} />
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {selected.length > 0 && (
        <div className="flex gap-1 border-t border-line pt-3">
          <IconAction label="Duplicate (Ctrl+D)" onClick={() => {
            const copies = duplicate(selected, session.nextZ());
            session.stopCapturing();
            copies.forEach((c) => session.add(c));
            setSelection(copies.map((c) => c.id));
          }}>
            <Copy size={16} />
          </IconAction>
          <IconAction label="Bring to front" onClick={() => session.bringToFront(selection)}>
            <BringToFront size={16} />
          </IconAction>
          <IconAction label="Delete (Del)" danger onClick={() => { session.stopCapturing(); session.remove(selection); setSelection([]); }}>
            <Trash2 size={16} />
          </IconAction>
        </div>
      )}
    </aside>
  );
}

function Swatches({ label, options, value, onPick }: { label: string; options: string[]; value: string; onPick: (v: string) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-semibold text-slate">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={NAMES[c] ?? c}
            aria-pressed={value === c}
            onClick={() => onPick(c)}
            className={clsx("h-6 w-6 rounded-full border", value === c ? "ring-2 ring-cobalt ring-offset-1" : "border-line")}
            style={
              c === "transparent"
                ? { background: "linear-gradient(135deg, white 45%, #e11d48 45%, #e11d48 55%, white 55%)" }
                : { background: c }
            }
          />
        ))}
      </div>
    </fieldset>
  );
}

function IconAction({ label, onClick, children, danger }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={clsx("grid h-8 flex-1 place-items-center rounded-md", danger ? "text-danger hover:bg-danger/10" : "text-ink hover:bg-ink/5")}
    >
      {children}
    </button>
  );
}
