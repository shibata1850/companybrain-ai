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
import { createPortal } from 'react-dom';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';

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

type Ghost = {
  /** viewport-fixed top-left of the floating clone */
  x: number;
  y: number;
  w: number;
  h: number;
  /** pointer offset within the picked-up tile */
  offX: number;
  offY: number;
};

/**
 * iPhone-home-screen-style reordering.
 *
 * - Long-press any tile (~300ms) enters "edit mode": every tile jiggles.
 * - The pressed tile is lifted and follows the finger/cursor as a
 *   floating clone; the other tiles slide out of the way (framer-motion
 *   `layout` animates the grid reflow).
 * - Release drops the tile into the gap. Edit mode stays on so several
 *   moves can be made in a row; tap 「完了」 or press Esc to finish.
 * - While in edit mode a normal tap does NOT navigate (tiles are for
 *   dragging); outside edit mode taps behave normally.
 *
 * The `ids` / `onReorder` / `data-sort-id` contract is unchanged.
 */
export default function SortableGrid({
  ids,
  onReorder,
  className,
  children,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [editMode, setEditMode] = useState(false);
  const [draftIds, setDraftIds] = useState<string[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [mounted, setMounted] = useState(false);

  // Pending long-press bookkeeping.
  const longPressTimerRef = useRef<number | null>(null);
  const pressStartRef = useRef<{ x: number; y: number } | null>(null);
  // Suppress the click that fires right after a drag so the card's
  // <Link> doesn't navigate on drop.
  const suppressClickRef = useRef(false);

  // Refs mirrored for the once-per-drag global listeners.
  const draftIdsRef = useRef<string[] | null>(null);
  const idsRef = useRef<string[]>(ids);
  const onReorderRef = useRef(onReorder);
  const editModeRef = useRef(false);
  useEffect(() => {
    draftIdsRef.current = draftIds;
  }, [draftIds]);
  useEffect(() => {
    idsRef.current = ids;
  }, [ids]);
  useEffect(() => {
    onReorderRef.current = onReorder;
  }, [onReorder]);
  useEffect(() => {
    editModeRef.current = editMode;
  }, [editMode]);
  useEffect(() => {
    setMounted(true);
  }, []);

  const view = draftIds ?? ids;

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pressStartRef.current = null;
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

  const move = useCallback((id: string, overId: string) => {
    setDraftIds((prev) => {
      const base = prev ?? idsRef.current;
      const from = base.indexOf(id);
      const to = base.indexOf(overId);
      if (from < 0 || to < 0 || from === to) return base;
      const next = base.slice();
      next.splice(from, 1);
      next.splice(to, 0, id);
      return next;
    });
  }, []);

  function beginDrag(id: string, clientX: number, clientY: number) {
    const container = containerRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLElement>(
      `[data-sort-id="${CSS.escape(id)}"]`,
    );
    if (!el) return;
    const r = el.getBoundingClientRect();
    setEditMode(true);
    setDraggingId(id);
    setDraftIds(idsRef.current.slice());
    setGhost({
      x: r.left,
      y: r.top,
      w: r.width,
      h: r.height,
      offX: clientX - r.left,
      offY: clientY - r.top,
    });
    suppressClickRef.current = true;
  }

  // Global listeners active only while a tile is picked up.
  useEffect(() => {
    if (!draggingId) return;
    function onMove(e: PointerEvent) {
      e.preventDefault();
      setGhost((g) =>
        g ? { ...g, x: e.clientX - g.offX, y: e.clientY - g.offY } : g,
      );
      const overId = getTileAt(e.clientX, e.clientY);
      if (overId && overId !== draggingId) move(draggingId!, overId);
    }
    function onUp() {
      const baseIds = idsRef.current;
      const finalOrder = draftIdsRef.current ?? baseIds;
      setDraggingId(null);
      setGhost(null);
      const changed =
        finalOrder.length === baseIds.length &&
        finalOrder.some((id, i) => id !== baseIds[i]);
      if (changed) onReorderRef.current(finalOrder);
      setDraftIds(null);
      // Let the click that trails this pointerup be swallowed, then reset.
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [draggingId, getTileAt, move]);

  // Esc leaves edit mode.
  useEffect(() => {
    if (!editMode) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !draggingId) setEditMode(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editMode, draggingId]);

  function onPointerDown(e: React.PointerEvent, id: string) {
    if (e.button !== 0 && e.pointerType !== 'touch') return;
    const clientX = e.clientX;
    const clientY = e.clientY;
    // Already editing → pick up immediately (no long-press needed), and
    // block the <Link> navigation.
    if (editModeRef.current) {
      e.preventDefault();
      beginDrag(id, clientX, clientY);
      return;
    }
    // Not editing yet → arm a long-press. A short tap falls through to
    // the tile's normal <Link> navigation.
    pressStartRef.current = { x: clientX, y: clientY };
    cancelLongPress();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      beginDrag(id, clientX, clientY);
    }, 300);
  }

  function onPointerMove(e: React.PointerEvent) {
    // Cancel a pending long-press if the finger moves enough to be a
    // scroll/tap-drag — keeps page scrolling intact.
    const start = pressStartRef.current;
    if (start && longPressTimerRef.current != null) {
      const dx = Math.abs(e.clientX - start.x);
      const dy = Math.abs(e.clientY - start.y);
      if (dx > 10 || dy > 10) cancelLongPress();
    }
  }

  function onPointerUp() {
    cancelLongPress();
  }

  function onClickCapture(e: React.MouseEvent) {
    // Swallow the click after a drag, and all tile clicks while editing.
    if (suppressClickRef.current || editModeRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  // Map children by id so we can render them in the (draft) view order.
  const childArray = Children.toArray(children).filter(isValidElement);
  const byId = new Map<string, React.ReactElement>();
  for (const child of childArray) {
    const id = (child.props as { 'data-sort-id'?: string })['data-sort-id'];
    if (typeof id === 'string') byId.set(id, child as React.ReactElement);
  }
  const draggingChild = draggingId ? byId.get(draggingId) : null;

  return (
    <>
      <LayoutGroup>
        <div ref={containerRef} className={className}>
          {view.map((id, index) => {
            const child = byId.get(id);
            if (!child) return null;
            const isDragging = draggingId === id;
            return (
              <motion.div
                key={id}
                layout
                data-sort-id={id}
                transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                onPointerDown={(e) => onPointerDown(e, id)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onClickCapture={onClickCapture}
                style={{ touchAction: draggingId ? 'none' : 'auto' }}
              >
                {/* Inner wrapper owns the jiggle so it never collides with
                    framer-motion's layout transform on the outer div. The
                    lifted tile is a floating clone (below), so its slot
                    here is just a faded placeholder that reflows. */}
                <div
                  className={
                    editMode && !isDragging ? 'cb-jiggle' : ''
                  }
                  style={{
                    animationDelay: `${((index % 5) - 2) * 0.045}s`,
                    animationDuration: `${0.24 + (index % 3) * 0.02}s`,
                    visibility: isDragging ? 'hidden' : 'visible',
                  }}
                >
                  {child}
                </div>
              </motion.div>
            );
          })}
        </div>

        {editMode && (
          <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 flex justify-center sm:bottom-6">
            <button
              type="button"
              onClick={() => {
                if (!draggingId) setEditMode(false);
              }}
              className="pointer-events-auto rounded-full bg-neutral-900 px-6 py-2.5 text-sm font-bold text-white shadow-lg ring-1 ring-black/5 transition active:scale-95"
            >
              完了
            </button>
          </div>
        )}
      </LayoutGroup>

      {/* Floating clone of the lifted tile, following the pointer. */}
      {mounted &&
        ghost &&
        draggingChild &&
        createPortal(
          <AnimatePresence>
            <motion.div
              initial={{ scale: 1 }}
              animate={{ scale: 1.08 }}
              className="pointer-events-none fixed z-[9999] drop-shadow-2xl"
              style={{
                left: ghost.x,
                top: ghost.y,
                width: ghost.w,
                height: ghost.h,
              }}
            >
              {draggingChild}
            </motion.div>
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
