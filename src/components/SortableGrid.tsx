'use client';

import {
  Children,
  isValidElement,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

type Props = {
  /** Stable ids in the current order. */
  ids: string[];
  /** Called with the new order on drop. */
  onReorder: (next: string[]) => void;
  /** Tailwind grid classes (cols / gap etc.). */
  className?: string;
  /** Children must be in the same order as `ids`, each with a unique key
   *  AND a `data-sort-id` attribute matching the id. */
  children: ReactNode;
};

/**
 * Long-press (~250ms) on touch, or mouse-down + drag on desktop, to
 * pick up a tile and drop it elsewhere in the grid. We rely on the
 * Pointer Events API so the same code path covers touch and mouse.
 *
 * The grid still uses CSS Grid for layout. While dragging, we measure
 * each tile's bounding rect and compute which tile the pointer is over,
 * then reorder the `ids` array preview-style. On drop we call
 * onReorder with the final order.
 */
export default function SortableGrid({
  ids,
  onReorder,
  className,
  children,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draftIds, setDraftIds] = useState<string[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const ghostStyleRef = useRef<{ x: number; y: number } | null>(null);
  const [, force] = useState(0);

  const view = draftIds ?? ids;

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const getTileAt = useCallback(
    (clientX: number, clientY: number): string | null => {
      const container = containerRef.current;
      if (!container) return null;
      const tiles = container.querySelectorAll<HTMLElement>('[data-sort-id]');
      for (const el of Array.from(tiles)) {
        const r = el.getBoundingClientRect();
        if (
          clientX >= r.left &&
          clientX <= r.right &&
          clientY >= r.top &&
          clientY <= r.bottom
        ) {
          return el.dataset.sortId || null;
        }
      }
      return null;
    },
    [],
  );

  const move = useCallback(
    (id: string, overId: string) => {
      setDraftIds((prev) => {
        const base = prev ?? ids;
        const from = base.indexOf(id);
        const to = base.indexOf(overId);
        if (from < 0 || to < 0 || from === to) return base;
        const next = base.slice();
        next.splice(from, 1);
        next.splice(to, 0, id);
        return next;
      });
    },
    [ids],
  );

  // Global listeners attached only while dragging.
  useEffect(() => {
    if (!draggingId) return;
    function onMove(e: PointerEvent) {
      e.preventDefault();
      ghostStyleRef.current = { x: e.clientX, y: e.clientY };
      force((n) => n + 1);
      const overId = getTileAt(e.clientX, e.clientY);
      if (overId && overId !== draggingId) move(draggingId!, overId);
    }
    function onUp() {
      const finalOrder = draftIds ?? ids;
      setDraggingId(null);
      ghostStyleRef.current = null;
      // Only fire onReorder if anything actually changed.
      const changed =
        finalOrder.length === ids.length &&
        finalOrder.some((id, i) => id !== ids[i]);
      if (changed) onReorder(finalOrder);
      setDraftIds(null);
    }
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [draggingId, draftIds, ids, getTileAt, move, onReorder]);

  function startDrag(id: string, clientX: number, clientY: number) {
    dragOriginRef.current = { x: clientX, y: clientY };
    setDraggingId(id);
    ghostStyleRef.current = { x: clientX, y: clientY };
  }

  function onPointerDown(e: React.PointerEvent, id: string) {
    // Skip non-primary buttons and anything that targeted a link/button
    // inside the tile — those need their click to work normally.
    if (e.button !== 0 && e.pointerType !== 'touch') return;
    const target = e.target as HTMLElement;
    if (target.closest('a, button, [role="button"], input, select, textarea')) {
      return;
    }
    const clientX = e.clientX;
    const clientY = e.clientY;
    if (e.pointerType === 'touch') {
      cancelLongPress();
      longPressTimerRef.current = window.setTimeout(() => {
        startDrag(id, clientX, clientY);
      }, 250);
    } else {
      // Desktop: start drag immediately so the user gets feedback.
      startDrag(id, clientX, clientY);
    }
  }

  function onPointerUp() {
    cancelLongPress();
  }

  function onPointerLeave() {
    cancelLongPress();
  }

  // Render children in the (possibly draft) order, decorating each
  // with sort handlers + visual state for the dragging tile.
  const childArray = Children.toArray(children).filter(isValidElement);
  const byId = new Map<string, React.ReactElement>();
  for (const child of childArray) {
    const id = (child.props as { 'data-sort-id'?: string })['data-sort-id'];
    if (typeof id === 'string') byId.set(id, child as React.ReactElement);
  }
  const ordered = view.map((id) => byId.get(id)).filter(Boolean) as React.ReactElement[];

  return (
    <div ref={containerRef} className={className}>
      {ordered.map((child) => {
        const id = (child.props as { 'data-sort-id'?: string })['data-sort-id']!;
        const isDragging = draggingId === id;
        return (
          <div
            key={id}
            data-sort-id={id}
            onPointerDown={(e) => onPointerDown(e, id)}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerLeave}
            className={`touch-none transition-transform ${
              isDragging
                ? 'scale-[1.04] opacity-80 shadow-2xl ring-2 ring-neutral-900'
                : draggingId
                ? 'opacity-60'
                : ''
            }`}
            style={{ touchAction: draggingId ? 'none' : 'auto' }}
          >
            {child}
          </div>
        );
      })}
    </div>
  );
}
