'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { fadeIn, popIn } from './tokens';

/**
 * 中央配置の汎用モーダル。バックドロップと中身を AnimatePresence で
 * 入退場アニメ。Esc / 背景クリックで onClose。スクロールロック付き。
 * UpgradeModal や今後の確認ダイアログをこの上に書き換える想定。
 */
export default function Modal({
  open,
  onClose,
  children,
  panelClassName = 'w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl',
  closeOnBackdrop = true,
  ariaLabel,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  panelClassName?: string;
  closeOnBackdrop?: boolean;
  ariaLabel?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="modal-root"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          variants={fadeIn}
          initial="hidden"
          animate="show"
          exit="exit"
          onClick={closeOnBackdrop ? onClose : undefined}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
        >
          <motion.div
            variants={popIn}
            initial="hidden"
            animate="show"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
            className={panelClassName}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
