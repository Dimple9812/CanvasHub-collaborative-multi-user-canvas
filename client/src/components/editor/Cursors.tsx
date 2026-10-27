import { memo } from "react";
import type { Peer } from "../../lib/types";
import { worldToScreen, type Viewport } from "../../lib/geometry";

/** Other people's pointers, drawn as HTML on top of the canvas so labels stay crisp at any zoom. */
export const Cursors = memo(function Cursors({ peers, viewport }: { peers: Peer[]; viewport: Viewport }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {peers.map((p) => {
        if (!p.cursor) return null;
        const { x, y } = worldToScreen(p.cursor, viewport);
        return (
          <div key={p.id} className="absolute left-0 top-0 transition-transform duration-75 ease-linear" style={{ transform: `translate(${x}px, ${y}px)` }}>
            <svg width="18" height="24" viewBox="0 0 18 24">
              <path d="M0 0 L0 20 L6 15 L10 24 L14 22 L10 13 L18 13 Z" fill={p.color} stroke="white" strokeWidth="1.5" />
            </svg>
            <span className="absolute left-4 top-5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ background: p.color }}>
              {p.name}
            </span>
          </div>
        );
      })}
    </div>
  );
});
