import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** Accessible dialog: traps focus, closes on Escape and backdrop click, restores focus on close. */
export function Modal({ title, onClose, children, width = 480 }: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current!;
    const focusables = () =>
      [...node.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
        (el) => !el.hasAttribute("disabled"),
      );
    (focusables()[1] ?? focusables()[0])?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key !== "Tab") return;
      const list = focusables();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    node.addEventListener("keydown", onKey);
    return () => {
      node.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full rounded-xl bg-white shadow-float" style={{ maxWidth: width }}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 id={titleId} className="text-lg font-bold">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-slate hover:bg-ink/5 hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
