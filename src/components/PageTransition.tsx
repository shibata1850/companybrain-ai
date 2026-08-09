'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { useRef } from 'react';
import { pageVariants, routeRank } from './motion/tokens';

/**
 * 方向を持つページ遷移(iOS の push/pop + Material 3 の Shared Axis)。
 *
 * - 深い画面へ進む: 右から押し込む / 戻る: 左へ戻す。ルートの深さ
 *   (routeRank)の差で方向を決めるので、履歴の追跡は不要。
 * - 同格のタブ間(ホーム/お知らせ/マイページ)は方向を付けず交差フェード。
 * - mode="popLayout" で退場と入場を重ねる。従来の mode="wait" は
 *   「退場完了 → 入場開始」の間に空白ができ、カクついて見えた。
 * - 入場はスプリングで最後にぬるっと減速して止まる(直線的に止めない)。
 * - OS の「視差効果を減らす」設定時はアニメーションを行わない。
 */
export default function PageTransition({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() || '/';
  const reduce = useReducedMotion();

  // 直前のパスとの深さ比較で方向を決める(+1 押し込み / -1 戻り / 0 同格)。
  // レンダー中に ref を更新する意図的なパターン: AnimatePresence は
  // 退場側にも最新の custom(方向)を渡す必要があるため、state に持つと
  // 1レンダー遅れて逆方向に動いてしまう。
  const prevPathRef = useRef(pathname);
  const dirRef = useRef(0);
  if (prevPathRef.current !== pathname) {
    const d = routeRank(pathname) - routeRank(prevPathRef.current);
    dirRef.current = d > 0 ? 1 : d < 0 ? -1 : 0;
    prevPathRef.current = pathname;
  }

  if (reduce) {
    return <div key={pathname}>{children}</div>;
  }

  const dir = dirRef.current;
  return (
    <AnimatePresence mode="popLayout" initial={false} custom={dir}>
      <motion.div
        key={pathname}
        custom={dir}
        variants={pageVariants}
        initial="enter"
        animate="center"
        exit="exit"
        style={{ willChange: 'transform, opacity' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
