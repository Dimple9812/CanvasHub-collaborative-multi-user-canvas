import { useEffect, useRef, useState } from "react";
import type { Shape } from "../../lib/types";
import { worldToScreen, type Viewport } from "../../lib/geometry";
import { stickyTextColor } from "../../lib/shapes";

/** In-place text editing: a textarea laid exactly over the shape while you type. */
export function TextEditor({ shape, viewport, onDone }: { shape: Shape; viewport: Viewport; onDone: (text: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(shape.text ?? "");
  const done = useRef(false);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone(value);
  };

  useEffect(() => {
    // Focus after the pointer event that created the box has finished.
    const raf = requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.select();
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const pos = worldToScreen({ x: shape.x, y: shape.y }, viewport);
  const isSticky = shape.type === "sticky";
  const pad = isSticky ? 14 * viewport.scale : 0;
  const fontSize = (shape.fontSize ?? 24) * viewport.scale;

  return (
    <textarea
      ref={ref}
      aria-label={isSticky ? "Sticky note text" : "Text"}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={finish}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
          e.preventDefault();
          finish();
        }
      }}
      className="absolute resize-none overflow-hidden border-none bg-transparent outline-none"
      style={{
        left: pos.x + pad,
        top: pos.y + pad,
        width: (shape.width - (isSticky ? 28 : 0)) * viewport.scale,
        height: Math.max(fontSize * 1.4, (shape.height - (isSticky ? 28 : 0)) * viewport.scale),
        fontSize,
        lineHeight: isSticky ? 1.3 : 1.25,
        fontWeight: isSticky ? 500 : 600,
        fontFamily: "Schibsted Grotesk, system-ui, sans-serif",
        color: isSticky ? stickyTextColor(shape.fill) : shape.stroke,
        transform: `rotate(${shape.rotation}deg)`,
        transformOrigin: "top left",
        padding: 0,
      }}
      placeholder={isSticky ? "Write a note" : "Type something"}
    />
  );
}
