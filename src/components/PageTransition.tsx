'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { durations, easeOut } from './motion/tokens';

/**
 * ルート変更ごとに children をフェード+上昇しながら入退場させる。
 * App Router では mode="wait" + key=pathname によって、
 * 退場 → 入場 の順で滑らかに切り替わる。
 */
export default function PageTransition({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: durations.base, ease: easeOut }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
