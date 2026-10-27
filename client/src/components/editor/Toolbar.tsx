import clsx from "clsx";
import { TOOLS } from "../../lib/tools";
import { useEditor } from "../../store/editor";

export function Toolbar({ canEdit }: { canEdit: boolean }) {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const visible = canEdit ? TOOLS : TOOLS.slice(0, 2);

  return (
    <div
      role="toolbar"
      aria-label="Drawing tools"
      className="pointer-events-auto absolute bottom-4 left-1/2 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-xl border border-line bg-white p-1 shadow-float"
    >
      {visible.map(({ tool: t, label, key, icon: Icon }, i) => (
        <span key={t} className="contents">
          {i === 2 && <span className="mx-1 h-6 w-px bg-line" aria-hidden="true" />}
          <button
            type="button"
            aria-label={`${label} (${key})`}
            aria-pressed={tool === t}
            title={`${label} — ${key}`}
            onClick={() => setTool(t)}
            className={clsx(
              "relative grid h-10 w-10 shrink-0 place-items-center rounded-lg transition-colors",
              tool === t ? "bg-cobalt-soft text-cobalt" : "text-ink hover:bg-ink/5",
            )}
          >
            <Icon size={19} strokeWidth={tool === t ? 2.4 : 2} aria-hidden="true" />
            <span className="absolute bottom-0.5 right-1 text-[9px] font-semibold text-slate/80" aria-hidden="true">
              {key}
            </span>
          </button>
        </span>
      ))}
    </div>
  );
}
