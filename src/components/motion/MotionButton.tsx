'use client';

import { forwardRef } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';

/**
 * すべてのタップ可能要素で同じ「押した感」を出す薄いラッパー。
 * 既存の <button className="..."> をそのまま置き換えできるよう、
 * ボタン属性を素通しする。色やサイズは呼び出し側で。
 */
type Props = Omit<HTMLMotionProps<'button'>, 'whileTap' | 'whileHover'> & {
  /** タップ時の縮みの強さ。デフォルト 0.96。 */
  tap?: number;
  /** hover で少し浮かせる(リフト)。デフォルト 0。 */
  lift?: number;
};

const MotionButton = forwardRef<HTMLButtonElement, Props>(function MotionButton(
  { tap = 0.96, lift = 0, type = 'button', ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type={type}
      whileTap={{ scale: tap }}
      whileHover={lift ? { y: -lift } : undefined}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      {...rest}
    />
  );
});

export default MotionButton;
