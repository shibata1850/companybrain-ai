'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Coords = { left: number; top: number; minWidth: number };

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
    setCoords({ left, top: r.bottom + 6, minWidth: w });
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
    function onScrollOrResize() {
      onClose();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, anchorRef, onClose]);

  if (!mounted || !open || !coords) return null;

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: coords.left,
        top: coords.top,
        minWidth: coords.minWidth,
        zIndex: 9999,
      }}
      className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg anim-fade-in"
    >
      {children}
    </div>,
    document.body,
  );
}
