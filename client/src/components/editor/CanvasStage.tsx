import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Layer, Rect, Stage, Transformer } from "react-konva";
import type Konva from "konva";
import type { BoardSession } from "../../lib/collab";
import type { Peer, Shape } from "../../lib/types";
import { useEditor } from "../../store/editor";
import { boxFromDrag, intersects, screenToWorld, shapeBounds, simplifyPoints, zoomAt, type Point } from "../../lib/geometry";
import { createShape, finalizeDraft, hasText, isPointShape } from "../../lib/shapes";
import { ShapeNode } from "./ShapeNode";
import { Cursors } from "./Cursors";
import { TextEditor } from "./TextEditor";

interface Props {
  session: BoardSession;
  shapes: Shape[];
  peers: Peer[];
  canEdit: boolean;
  stageRef: React.RefObject<Konva.Stage | null>;
}

type Gesture =
  | { kind: "pan"; start: Point; vp: { x: number; y: number } }
  | { kind: "marquee"; origin: Point; additive: string[] }
  | { kind: "draw"; origin: Point }
  | null;

export function CanvasStage({ session, shapes, peers, canEdit, stageRef }: Props) {
  const { tool, selection, viewport, editingTextId, setSelection, setViewport, setTool, setEditingText } = useEditor();
  const containerRef = useRef<HTMLDivElement>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [draft, setDraftState] = useState<Shape | null>(null);
  // Konva events are native listeners, so React may not re-render between two pointer events.
  // Gesture state lives in refs and is read fresh from the store, never from a stale closure.
  const draftRef = useRef<Shape | null>(null);
  const setDraft = (d: Shape | null) => {
    draftRef.current = d;
    setDraftState(d);
  };
  const shapesRef = useRef(shapes);
  useLayoutEffect(() => {
    shapesRef.current = shapes;
  });
  const [panning, setPanning] = useState(false);
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const gesture = useRef<Gesture>(null);
  const dragStart = useRef<Map<string, Point>>(new Map());

  const byId = useMemo(() => new Map(shapes.map((s) => [s.id, s])), [shapes]);

  // Keep the stage the size of its container.
  useEffect(() => {
    const el = containerRef.current!;
    const ro = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Drop selected ids that no longer exist (deleted by someone else, undo).
  useEffect(() => {
    const alive = selection.filter((id) => byId.has(id));
    if (alive.length !== selection.length) setSelection(alive);
  }, [byId, selection, setSelection]);

  // Attach the resize/rotate handles to the selected shapes.
  useEffect(() => {
    const tr = trRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const nodes = tool === "select" && canEdit ? selection.map((id) => findById(stage, id)).filter(Boolean) : [];
    tr.nodes(nodes as Konva.Node[]);
    tr.getLayer()?.batchDraw();
  }, [selection, shapes, tool, canEdit, stageRef]);

  useEffect(() => {
    session.setPresence({ selection });
  }, [session, selection]);

  // A drag that starts on the canvas keeps going (and ends) even if the pointer passes over a panel.
  const gestureHandlers = useRef<{ move: (e: PointerEvent) => void; end: () => void }>({ move: noop, end: noop });
  useEffect(() => {
    const move = (e: PointerEvent) => gestureHandlers.current.move(e);
    const end = () => gestureHandlers.current.end();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, []);

  // ---------- pointer gestures ----------
  const onPointerDown = (e: Konva.KonvaEventObject<PointerEvent>) => {
    const { tool, style, selection, viewport } = useEditor.getState();
    const stage = stageRef.current!;
    const screen = stage.getPointerPosition()!;
    const world = screenToWorld(screen, viewport);
    const onEmpty = e.target === stage;

    if (tool === "hand" || e.evt.button === 1) {
      gesture.current = { kind: "pan", start: screen, vp: { x: viewport.x, y: viewport.y } };
      setPanning(true);
      return;
    }
    if (tool === "select") {
      if (onEmpty) {
        gesture.current = { kind: "marquee", origin: world, additive: e.evt.shiftKey ? selection : [] };
        if (!e.evt.shiftKey) setSelection([]);
      }
      return;
    }
    if (!canEdit) return;

    if (tool === "text" || tool === "sticky") {
      // Stop the browser's mousedown focus handling from immediately blurring the new text box.
      e.evt.preventDefault();
      const shape = createShape(tool, style, session.nextZ(), world);
      session.stopCapturing();
      session.add(shape);
      setTool("select");
      setSelection([shape.id]);
      setEditingText(shape.id);
      return;
    }
    const shape = createShape(tool, style, session.nextZ(), world);
    if (tool === "pen") shape.points = [0, 0];
    setDraft(shape);
    gesture.current = { kind: "draw", origin: world };
  };

  /** Presence only; gesture moves are tracked on window so they keep working over the floating panels. */
  const onPointerMove = () => {
    if (gesture.current) return;
    const screen = stageRef.current?.getPointerPosition();
    if (screen) session.setPresence({ cursor: screen ? screenToWorld(screen, useEditor.getState().viewport) : null });
  };

  const onGestureMove = (ev: PointerEvent) => {
    const stage = stageRef.current;
    const g = gesture.current;
    if (!stage || !g) return;
    stage.setPointersPositions(ev);
    const screen = stage.getPointerPosition();
    if (!screen) return;
    const world = screenToWorld(screen, useEditor.getState().viewport);
    session.setPresence({ cursor: world });
    const draft = draftRef.current;

    if (g.kind === "pan") {
      setViewport({ ...useEditor.getState().viewport, x: g.vp.x + screen.x - g.start.x, y: g.vp.y + screen.y - g.start.y });
    } else if (g.kind === "marquee") {
      const box = boxFromDrag(g.origin, world);
      setMarquee(box);
      const hit = shapesRef.current.filter((s) => intersects(shapeBounds(s), box)).map((s) => s.id);
      setSelection([...new Set([...g.additive, ...hit])]);
    } else if (g.kind === "draw" && draft) {
      const dx = world.x - g.origin.x;
      const dy = world.y - g.origin.y;
      if (draft.type === "pen") {
        setDraft({ ...draft, points: [...(draft.points ?? []), dx, dy] });
      } else if (isPointShape(draft.type)) {
        // Shift snaps lines to 45°.
        let [px, py] = [dx, dy];
        if (ev.shiftKey) {
          const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
          const len = Math.hypot(dx, dy);
          [px, py] = [Math.cos(angle) * len, Math.sin(angle) * len];
        }
        setDraft({ ...draft, points: [0, 0, px, py] });
      } else {
        const box = boxFromDrag(g.origin, world);
        setDraft({ ...draft, ...box });
      }
    }
  };

  const onGestureEnd = () => {
    const g = gesture.current;
    gesture.current = null;
    setMarquee(null);
    setPanning(false);
    const draft = draftRef.current;
    if (g?.kind === "draw" && draft) {
      let shape = finalizeDraft(draft);
      if (shape?.type === "pen") shape = { ...shape, points: simplifyPoints(shape.points ?? []) };
      setDraft(null);
      if (shape) {
        session.stopCapturing();
        session.add(shape);
        if (shape.type !== "pen") {
          setTool("select");
          setSelection([shape.id]);
        }
      }
    }
  };

  useLayoutEffect(() => {
    gestureHandlers.current = { move: onGestureMove, end: onGestureEnd };
  });

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const viewport = useEditor.getState().viewport;
    const pointer = stageRef.current!.getPointerPosition()!;
    if (e.evt.ctrlKey || e.evt.metaKey) {
      // Pinch-zoom on trackpads also arrives as ctrl+wheel.
      const factor = Math.exp(-e.evt.deltaY * 0.01);
      setViewport(zoomAt(viewport, pointer, viewport.scale * factor));
    } else {
      setViewport({ ...viewport, x: viewport.x - e.evt.deltaX, y: viewport.y - e.evt.deltaY });
    }
  };

  // ---------- shape interactions ----------
  const onSelect = useCallback(
    (id: string, additive: boolean) => {
      const { tool: t, selection: sel } = useEditor.getState();
      if (t !== "select") return;
      if (additive) setSelection(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
      else if (!sel.includes(id)) setSelection([id]);
    },
    [setSelection],
  );

  const onDragStart = useCallback(
    (id: string) => {
      session.stopCapturing();
      const sel = useEditor.getState().selection;
      const ids = sel.includes(id) ? sel : [id];
      dragStart.current = new Map(ids.map((sid) => [sid, { x: byId.get(sid)!.x, y: byId.get(sid)!.y }]));
    },
    [session, byId],
  );

  const onDragMove = useCallback(
    (id: string, node: Konva.Node) => {
      const origin = dragStart.current.get(id);
      if (!origin) return;
      const dx = node.x() - origin.x;
      const dy = node.y() - origin.y;
      const stage = stageRef.current!;
      const patches: [string, Partial<Shape>][] = [];
      for (const [sid, start] of dragStart.current) {
        if (sid !== id) findById(stage, sid)?.position({ x: start.x + dx, y: start.y + dy });
        patches.push([sid, { x: Math.round(start.x + dx), y: Math.round(start.y + dy) }]);
      }
      session.updateMany(patches); // batched and sent ~30 times a second, so others see the drag live
    },
    [session, stageRef],
  );

  const onDragEnd = useCallback(() => {
    dragStart.current.clear();
    session.stopCapturing();
  }, [session]);

  const onTransformEnd = useCallback(
    (id: string, node: Konva.Node) => {
      const s = byId.get(id);
      if (!s) return;
      const sx = node.scaleX();
      const sy = node.scaleY();
      node.scale({ x: 1, y: 1 });
      const patch: Partial<Shape> = { x: Math.round(node.x()), y: Math.round(node.y()), rotation: Math.round(node.rotation()) };
      if (isPointShape(s.type)) {
        patch.points = (s.points ?? []).map((v, i) => Math.round(v * (i % 2 === 0 ? sx : sy) * 10) / 10);
      } else {
        patch.width = Math.max(8, Math.round(s.width * sx));
        patch.height = Math.max(8, Math.round(s.height * sy));
        if (s.type === "text") patch.fontSize = Math.max(8, Math.round((s.fontSize ?? 24) * sy));
      }
      session.stopCapturing();
      session.update(id, patch);
    },
    [byId, session],
  );

  const onEditText = useCallback(
    (id: string) => {
      const s = byId.get(id);
      if (s && hasText(s.type) && canEdit) setEditingText(id);
    },
    [byId, canEdit, setEditingText],
  );

  const draggable = tool === "select" && canEdit;
  const cursor = tool === "hand" ? (panning ? "grabbing" : "grab") : tool === "select" ? "default" : "crosshair";
  // Keep the dot grid readable at any zoom by doubling its spacing when dots get too dense.
  let gridSize = 24 * viewport.scale;
  while (gridSize < 14) gridSize *= 2;
  const editing = editingTextId ? byId.get(editingTextId) : undefined;

  return (
    <div
      ref={containerRef}
      className="dot-grid absolute inset-0 overflow-hidden touch-none"
      style={{ cursor, backgroundSize: `${gridSize}px ${gridSize}px`, backgroundPosition: `${viewport.x}px ${viewport.y}px` }}
      onPointerLeave={() => session.setPresence({ cursor: null })}
      role="region"
      aria-label={`Canvas with ${shapes.length} ${shapes.length === 1 ? "shape" : "shapes"}`}
      data-shape-count={shapes.length}
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={viewport.x}
        y={viewport.y}
        scaleX={viewport.scale}
        scaleY={viewport.scale}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onWheel={onWheel}
      >
        <Layer name="content">
          {shapes.map((s) => (
            <ShapeNode
              key={s.id}
              shape={s}
              draggable={draggable}
              hidden={s.id === editingTextId}
              onSelect={onSelect}
              onDragStart={onDragStart}
              onDragMove={onDragMove}
              onDragEnd={onDragEnd}
              onTransformEnd={onTransformEnd}
              onEditText={onEditText}
            />
          ))}
        </Layer>
        <Layer listening={false} name="overlay">
          {draft && <ShapeNode shape={draft} draggable={false} />}
          {peers.flatMap((p) =>
            p.selection.map((id) => {
              const s = byId.get(id);
              if (!s) return null;
              const b = shapeBounds(s);
              return (
                <Rect key={`${p.id}-${id}`} x={b.x - 4} y={b.y - 4} width={b.width + 8} height={b.height + 8} stroke={p.color} strokeWidth={1.5 / viewport.scale} dash={[6 / viewport.scale, 4 / viewport.scale]} cornerRadius={4} />
              );
            }),
          )}
          {marquee && <Rect {...marquee} fill="rgba(47,91,234,0.08)" stroke="#2f5bea" strokeWidth={1 / viewport.scale} />}
        </Layer>
        <Layer name="handles">
          <Transformer
            ref={trRef}
            rotateEnabled
            keepRatio={false}
            borderStroke="#2f5bea"
            anchorStroke="#2f5bea"
            anchorSize={9}
            anchorCornerRadius={2}
            padding={4}
            ignoreStroke
            boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < 8 || Math.abs(newBox.height) < 8 ? oldBox : newBox)}
          />
        </Layer>
      </Stage>
      <Cursors peers={peers} viewport={viewport} />
      {editing && (
        <TextEditor
          key={editing.id}
          shape={editing}
          viewport={viewport}
          onDone={(text) => {
            setEditingText(null);
            if (!text.trim() && editing.type === "text") session.remove([editing.id]);
            else if (text !== editing.text) session.update(editing.id, { text });
            session.stopCapturing();
          }}
        />
      )}
    </div>
  );
}

/** Ids may start with a digit, which Konva's "#id" selector can't parse, so match by function. */
const findById = (stage: Konva.Stage, id: string) => stage.findOne((n: Konva.Node) => n.id() === id && n.hasName("shape"));

const noop = () => {};
