import { memo } from "react";
import { Arrow, Ellipse, Group, Line, Rect, Text } from "react-konva";
import type Konva from "konva";
import type { Shape } from "../../lib/types";
import { stickyTextColor } from "../../lib/shapes";
import { useEditor } from "../../store/editor";

const FONT = "Schibsted Grotesk, system-ui, sans-serif";

interface Props {
  shape: Shape;
  draggable: boolean;
  hidden?: boolean; // while its text is being edited in the overlay
  onSelect?: (id: string, additive: boolean) => void;
  onDragStart?: (id: string) => void;
  onDragMove?: (id: string, node: Konva.Node) => void;
  onDragEnd?: (id: string) => void;
  onTransformEnd?: (id: string, node: Konva.Node) => void;
  onEditText?: (id: string) => void;
}

/** One canvas object. Memoised: unchanged shapes keep the same object from Yjs and skip re-rendering. */
export const ShapeNode = memo(function ShapeNode({
  shape: s, draggable, hidden, onSelect, onDragStart, onDragMove, onDragEnd, onTransformEnd, onEditText,
}: Props) {
  return (
    <Group
      id={s.id}
      name="shape"
      x={s.x}
      y={s.y}
      rotation={s.rotation}
      draggable={draggable}
      opacity={hidden ? 0 : 1}
      onPointerDown={(e) => {
        // With a drawing tool active, a press on a shape starts a new shape on top of it instead.
        if (e.evt.button !== 0 || useEditor.getState().tool !== "select") return;
        e.cancelBubble = true;
        onSelect?.(s.id, e.evt.shiftKey);
      }}
      onDragStart={() => onDragStart?.(s.id)}
      onDragMove={(e) => onDragMove?.(s.id, e.target)}
      onDragEnd={() => onDragEnd?.(s.id)}
      onTransformEnd={(e) => onTransformEnd?.(s.id, e.target)}
      onDblClick={() => onEditText?.(s.id)}
      onDblTap={() => onEditText?.(s.id)}
    >
      {renderBody(s)}
    </Group>
  );
});

function renderBody(s: Shape) {
  const common = { stroke: s.stroke, strokeWidth: s.strokeWidth, perfectDrawEnabled: false };
  switch (s.type) {
    case "rect":
      return <Rect width={s.width} height={s.height} fill={s.fill === "transparent" ? undefined : s.fill} cornerRadius={6} {...common} hitStrokeWidth={12} fillEnabled={true} />;
    case "ellipse":
      return (
        <Ellipse
          x={s.width / 2}
          y={s.height / 2}
          radiusX={Math.max(1, s.width / 2)}
          radiusY={Math.max(1, s.height / 2)}
          fill={s.fill === "transparent" ? undefined : s.fill}
          {...common}
          hitStrokeWidth={12}
        />
      );
    case "line":
      return <Line points={s.points ?? []} lineCap="round" {...common} hitStrokeWidth={18} />;
    case "arrow":
      return <Arrow points={s.points ?? []} fill={s.stroke} pointerLength={10 + s.strokeWidth * 2} pointerWidth={10 + s.strokeWidth * 2} lineCap="round" {...common} hitStrokeWidth={18} />;
    case "pen":
      return <Line points={s.points ?? []} tension={0.4} lineCap="round" lineJoin="round" {...common} hitStrokeWidth={18} />;
    case "text":
      return (
        <Text
          text={s.text || " "}
          width={s.width}
          fontSize={s.fontSize ?? 24}
          fontFamily={FONT}
          fontStyle="600"
          lineHeight={1.25}
          fill={s.stroke}
        />
      );
    case "sticky":
      return (
        <>
          <Rect width={s.width} height={s.height} fill={s.fill} cornerRadius={4} shadowColor="#1c2433" shadowOpacity={0.14} shadowBlur={12} shadowOffsetY={4} />
          <Text
            text={s.text ?? ""}
            x={14}
            y={14}
            width={s.width - 28}
            height={s.height - 28}
            fontSize={s.fontSize ?? 18}
            fontFamily={FONT}
            fontStyle="500"
            lineHeight={1.3}
            fill={stickyTextColor(s.fill)}
            ellipsis
          />
        </>
      );
  }
}
