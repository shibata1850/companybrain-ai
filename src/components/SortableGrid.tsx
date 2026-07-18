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
  // The tile we last swapped with. Used to stop the reorder from
  // oscillating while the layout animation is still in flight (see onMove).
  const lastOverIdRef = useRef<string | null>(null);

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
    return () => {
      // Detach any pending long-press watchers if we unmount mid-press.
      if (pendingWatchersRef.current) {
        pendingWatchersRef.current();
        pendingWatchersRef.current = null;
      }
    };
  }, []);

  const view = draftIds ?? ids;

  // Window-level watchers that cancel a pending long-press the moment the
  // gesture turns into a scroll. Element onPointerMove is unreliable on
  // touch: once the browser starts scrolling it stops delivering move
  // events to the tile and instead fires pointercancel — so we listen
  // globally for touchmove / scroll / pointercancel while a press is
  // pending. Stored so we can detach them together.
  const pendingWatchersRef = useRef<(() => void) | null>(null);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pressStartRef.current = null;
    if (pendingWatchersRef.current) {
      pendingWatchersRef.current();
      pendingWatchersRef.current = null;
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
    lastOverIdRef.current = null;
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
      // Hysteresis: only reorder when the pointer enters a *different*
      // tile than the one we last swapped with. Without this, a tile's
      // mid-flight layout animation keeps reporting the same neighbour
      // under a stationary pointer, so the order flips back and forth
      // every frame — the visible "trembling" when tiles overlap. Over
      // our own placeholder (or an empty gap) we clear the marker so
      // re-entering a tile triggers a fresh swap.
      if (!overId || overId === draggingId) {
        lastOverIdRef.current = null;
        return;
      }
      if (overId === lastOverIdRef.current) return;
      lastOverIdRef.current = overId;
      move(draggingId!, overId);
    }
    function onUp() {
      const baseIds = idsRef.current;
      const finalOrder = draftIdsRef.current ?? baseIds;
      setDraggingId(null);
      setGhost(null);
      lastOverIdRef.current = null;
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
    // the tile's normal <Link> navigation; any scroll cancels it.
    cancelLongPress();
    pressStartRef.current = { x: clientX, y: clientY };

    const MOVE_CANCEL = 8; // px of movement that counts as "scrolling"
    const onWinMove = (ev: PointerEvent | TouchEvent) => {
      const start = pressStartRef.current;
      if (!start) return;
      const pt =
        'touches' in ev
          ? ev.touches[0] ?? ev.changedTouches[0]
          : (ev as PointerEvent);
      if (!pt) return;
      if (
        Math.abs(pt.clientX - start.x) > MOVE_CANCEL ||
        Math.abs(pt.clientY - start.y) > MOVE_CANCEL
      ) {
        cancelLongPress();
      }
    };
    const onCancel = () => cancelLongPress();
    // passive so we never block the browser's native scroll.
    window.addEventListener('pointermove', onWinMove, { passive: true });
    window.addEventListener('touchmove', onWinMove, { passive: true });
    window.addEventListener('scroll', onCancel, {
      passive: true,
      capture: true,
    });
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('pointerup', onCancel);
    pendingWatchersRef.current = () => {
      window.removeEventListener('pointermove', onWinMove);
      window.removeEventListener('touchmove', onWinMove);
      window.removeEventListener('scroll', onCancel, true);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('pointerup', onCancel);
    };

    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      if (pendingWatchersRef.current) {
        pendingWatchersRef.current();
        pendingWatchersRef.current = null;
      }
      beginDrag(id, clientX, clientY);
    }, 400);
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
          {view.map((id) => {
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
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onClickCapture={onClickCapture}
                style={{ touchAction: draggingId ? 'none' : 'auto' }}
              >
                {/* 移動中のタイルは、元の場所に破線のドロップ枠を出す。
                    実体(child)は visibility:hidden でスロットの大きさだけ
                    保ち(レイアウトを崩さない)、その上に枠を重ねる。持ち上げ
                    たタイルは下のフローティングクローンとして指に追従する。 */}
                <div className="relative">
                  <div
                    style={{
                      visibility: isDragging ? 'hidden' : 'visible',
                    }}
                  >
                    {child}
                  </div>
                  {isDragging && (
                    <div className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-dashed border-neutral-300 bg-neutral-100/60" />
                  )}
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
              initial={{ scale: 1, rotate: 0 }}
              animate={{ scale: 1.06, rotate: -2.5 }}
              className="pointer-events-none fixed z-[9999] drop-shadow-2xl"
              style={{
                left: ghost.x,
                top: ghost.y,
                width: ghost.w,
                height: ghost.h,
              }}
            >
              {/* 持ち上げたブレインだと一目で分かるようにリング(枠)を重ねる。 */}
              <div className="overflow-hidden rounded-2xl ring-2 ring-neutral-900/80 ring-offset-2 ring-offset-white">
                {draggingChild}
              </div>
            </motion.div>
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
