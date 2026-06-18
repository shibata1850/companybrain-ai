'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Props = {
  open: boolean;
  title: string;
  description: string;
  /** Label shown on the slider track ("→ スライドして一時停止"). */
  actionLabel: string;
  /** Visual tone of the action. */
  tone?: 'amber' | 'red' | 'green';
  /** Called when the user fully slides the thumb to the end. */
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
};

const TONE: Record<
  NonNullable<Props['tone']>,
  { track: string; fill: string; thumb: string; label: string }
> = {
  amber: {
    track: 'bg-amber-50 border-amber-200',
    fill: 'bg-amber-300/60',
    thumb: 'bg-amber-500 text-white',
    label: 'text-amber-900',
  },
  red: {
    track: 'bg-red-50 border-red-200',
    fill: 'bg-red-300/60',
    thumb: 'bg-red-600 text-white',
    label: 'text-red-900',
  },
  green: {
    track: 'bg-green-50 border-green-200',
    fill: 'bg-green-300/60',
    thumb: 'bg-green-600 text-white',
    label: 'text-green-900',
  },
};

/**
 * Modal that requires the admin to drag a thumb from one end of a track
 * to the other in order to commit a sensitive action. The first
 * dismiss-confirm gate is the modal itself (opening it = step 1); the
 * drag is step 2, so accidental taps can't trigger anything.
 */
export default function SlideToConfirm({
  open,
  title,
  description,
  actionLabel,
  tone = 'amber',
  onConfirm,
  onClose,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [submitting, setSubmitting] = useState(false);
  const palette = TONE[tone];

  const reset = useCallback(() => {
    setProgress(0);
    setDragging(false);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const updateFromClientX = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    // Thumb is 56px wide — the reachable range is rect.width - 56.
    const usable = Math.max(1, rect.width - 56);
    const x = Math.min(usable, Math.max(0, clientX - rect.left - 28));
    const p = x / usable;
    setProgress(p);
    return p;
  }, []);

  const finish = useCallback(
    async (p: number) => {
      setDragging(false);
      if (p >= 0.98) {
        setSubmitting(true);
        try {
          await onConfirm();
        } finally {
          setSubmitting(false);
          reset();
        }
      } else {
        // Snap back if not slid far enough.
        setProgress(0);
      }
    },
    [onConfirm, reset],
  );

  useEffect(() => {
    if (!dragging) return;
    function onMove(e: MouseEvent | TouchEvent) {
      const clientX =
        'touches' in e ? e.touches[0]?.clientX ?? 0 : (e as MouseEvent).clientX;
      updateFromClientX(clientX);
      // Stop the page from scrolling while the thumb is being dragged.
      if ('touches' in e) e.preventDefault();
    }
    function onUp(e: MouseEvent | TouchEvent) {
      const clientX =
        'changedTouches' in e
          ? e.changedTouches[0]?.clientX ?? 0
          : (e as MouseEvent).clientX;
      const p = updateFromClientX(clientX);
      void finish(p);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [dragging, finish, updateFromClientX]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-2 px-5 pb-2 pt-5">
          <h3 className="text-base font-semibold text-neutral-900">{title}</h3>
          <p className="text-sm leading-relaxed text-neutral-600">
            {description}
          </p>
        </div>

        <div className="p-5">
          <div
            ref={trackRef}
            className={`relative h-14 select-none overflow-hidden rounded-full border ${palette.track}`}
            onTouchStart={(e) => {
              if (submitting) return;
              setDragging(true);
              updateFromClientX(e.touches[0].clientX);
            }}
            onMouseDown={(e) => {
              if (submitting) return;
              setDragging(true);
              updateFromClientX(e.clientX);
            }}
          >
            {/* progress fill */}
            <div
              className={`absolute inset-y-0 left-0 ${palette.fill} transition-[width] ${
                dragging ? 'duration-0' : 'duration-200'
              }`}
              style={{ width: `calc(28px + ${progress * 100}% * (1 - 56 / 100))` }}
            />
            {/* label */}
            <div
              className={`pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-medium ${palette.label}`}
              style={{ opacity: 1 - progress * 1.2 }}
            >
              {submitting ? '実行中…' : actionLabel}
            </div>
            {/* thumb */}
            <div
              className={`absolute top-1 grid h-12 w-12 cursor-grab place-items-center rounded-full shadow-md transition-transform ${palette.thumb} ${
                dragging ? 'duration-0 cursor-grabbing' : 'duration-200'
              }`}
              style={{
                left: `calc(4px + ${progress} * (100% - 56px))`,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
                <path
                  d="M5 10h10M11 6l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="mt-4 w-full rounded-full border border-neutral-300 bg-white py-2 text-xs font-medium text-neutral-600 transition hover:border-neutral-900 hover:text-neutral-900 disabled:opacity-50"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
