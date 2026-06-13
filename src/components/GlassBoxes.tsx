import { useRef } from 'react';
import type React from 'react';
import type { GlassShape } from '../types';

const MIN_SIZE = 16; // image px

type HandleDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const HANDLES: HandleDir[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

const HANDLE_CURSOR: Record<HandleDir, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
};

interface DragState {
  id: string;
  mode: 'move' | HandleDir;
  startClientX: number;
  startClientY: number;
  orig: GlassShape;
}

interface Props {
  shapes: GlassShape[];
  selectedId: string | null;
  /** CSS px per image px */
  scale: number;
  onSelect: (id: string | null) => void;
  onPatch: (id: string, patch: Partial<GlassShape>) => void;
  onDragEnd?: () => void;
  onAddAt: (cx: number, cy: number) => void;
}

export function GlassBoxes({
  shapes,
  selectedId,
  scale,
  onSelect,
  onPatch,
  onDragEnd,
  onAddAt,
}: Props) {
  const dragRef = useRef<DragState | null>(null);

  const startDrag = (
    e: React.PointerEvent,
    shape: GlassShape,
    mode: DragState['mode'],
  ) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onSelect(shape.id);
    dragRef.current = {
      id: shape.id,
      mode,
      startClientX: e.clientX,
      startClientY: e.clientY,
      orig: { ...shape },
    };
  };

  const moveDrag = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (e.clientX - drag.startClientX) / scale;
    const dy = (e.clientY - drag.startClientY) / scale;
    const o = drag.orig;

    if (drag.mode === 'move') {
      onPatch(drag.id, { cx: o.cx + dx, cy: o.cy + dy });
      return;
    }

    let left = o.cx - o.w / 2;
    let right = o.cx + o.w / 2;
    let top = o.cy - o.h / 2;
    let bottom = o.cy + o.h / 2;

    if (drag.mode.includes('w')) left = Math.min(left + dx, right - MIN_SIZE);
    if (drag.mode.includes('e')) right = Math.max(right + dx, left + MIN_SIZE);
    if (drag.mode.includes('n')) top = Math.min(top + dy, bottom - MIN_SIZE);
    if (drag.mode.includes('s')) bottom = Math.max(bottom + dy, top + MIN_SIZE);

    onPatch(drag.id, {
      cx: (left + right) / 2,
      cy: (top + bottom) / 2,
      w: right - left,
      h: bottom - top,
    });
  };

  const endDrag = () => {
    if (dragRef.current) onDragEnd?.();
    dragRef.current = null;
  };

  return (
    <div
      className="glass-overlay"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onSelect(null);
      }}
      onDoubleClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const rect = e.currentTarget.getBoundingClientRect();
        onAddAt((e.clientX - rect.left) / scale, (e.clientY - rect.top) / scale);
      }}
    >
      {shapes.map((s, index) => {
        const selected = s.id === selectedId;
        return (
          <div
            key={s.id}
            className={`glass-box${selected ? ' selected' : ''}`}
            style={{
              left: (s.cx - s.w / 2) * scale,
              top: (s.cy - s.h / 2) * scale,
              width: s.w * scale,
              height: s.h * scale,
              borderRadius: ((Math.min(s.w, s.h) / 2) * (s.radiusPct / 100)) * scale,
            }}
            onPointerDown={(e) => startDrag(e, s, 'move')}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <span className="glass-box-label">{index + 1}</span>
            {selected &&
              HANDLES.map((dir) => (
                <div
                  key={dir}
                  className={`glass-handle glass-handle-${dir}`}
                  style={{ cursor: HANDLE_CURSOR[dir] }}
                  onPointerDown={(e) => startDrag(e, s, dir)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                />
              ))}
          </div>
        );
      })}
    </div>
  );
}
