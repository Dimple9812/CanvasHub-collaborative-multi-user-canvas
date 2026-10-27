import clsx from "clsx";
import { useToasts } from "../../lib/toast";

export function Toaster() {
  const items = useToasts((s) => s.items);
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-20 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          className={clsx("rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-float", t.tone === "error" ? "bg-danger" : "bg-ink")}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
