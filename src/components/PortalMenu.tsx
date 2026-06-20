'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { dropdown } from './motion/tokens';

type Coords = {
  left: number;
  minWidth: number;
  maxHeight: number;
  /** Either top or bottom is set, depending on whether the menu opens
   * downward or upward. */
  top?: number;
  bottom?: number;
};

/**
 * Anchored dropdown that renders into document.body so it's never
 * stacked under sibling cards / animated parents. Pass children
 * for the menu body; PortalMenu handles positioning, outside-click,
 * scroll-close, escape-close.
 *
 * Caller owns the trigger button and the open state.
 */
export default function PortalMenu({
  anchorRef,
  open,
  onClose,
  align = 'start',
  width,
  children,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  /** start = align menu's left edge to the trigger; end = align right edge. */
  align?: 'start' | 'end';
  /** Minimum width in px; defaults to the trigger's width clamped to 176. */
  width?: number;
  children: React.ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setCoords(null);
      return;
    }
    const r = anchorRef.current.getBoundingClientRect();
    const w = width ?? Math.max(176, r.width);
    const left = align === 'end' ? r.right - w : r.left;
    const viewportH = window.innerHeight;
    const margin = 8;
    const gap = 6;
    const spaceBelow = viewportH - r.bottom - gap - margin;
    const spaceAbove = r.top - gap - margin;
    // Flip up only when there's clearly more room above. Otherwise prefer
    // dropping down and let maxHeight + scroll handle overflow.
    if (spaceBelow < 160 && spaceAbove > spaceBelow) {
      setCoords({
        left,
        bottom: viewportH - r.top + gap,
        minWidth: w,
        maxHeight: Math.max(120, spaceAbove),
      });
    } else {
      setCoords({
        left,
        top: r.bottom + gap,
        minWidth: w,
        maxHeight: Math.max(120, spaceBelow),
      });
    }
  }, [open, anchorRef, align, width]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    function onScroll(e: Event) {
      // Ignore scroll events that originate inside the menu itself —
      // we want internal scrolling to work without closing the menu.
      if (menuRef.current?.contains(e.target as Node)) return;
      onClose();
    }
    function onResize() {
      onClose();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, anchorRef, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && coords && (
        <motion.div
          ref={menuRef}
          variants={dropdown}
          initial="hidden"
          animate="show"
          exit="exit"
          style={{
            position: 'fixed',
            left: coords.left,
            top: coords.top,
            bottom: coords.bottom,
            minWidth: coords.minWidth,
            maxHeight: coords.maxHeight,
            zIndex: 9999,
            transformOrigin: coords.bottom ? 'bottom left' : 'top left',
          }}
          className="flex flex-col overflow-y-auto overscroll-contain rounded-xl border border-neutral-200 bg-white shadow-lg"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
