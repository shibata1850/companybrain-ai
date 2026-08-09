/**
 * モーションのデザイントークン。framer-motion の Transition / Variant を
 * このファイル経由で揃えることで、アプリ全体の「動きの個性」を一箇所で
 * チューニングできるようにする。CompanyBrain の方針は「しっかり体感
 * できる」だが、滞留しない短めの曲線(150〜320ms)で統一する。
 */
import type { Transition, Variants } from 'framer-motion';

/** いわゆる "ease-out-expo" 風。離陸が速く、最後にスッと止まる。 */
export const easeOut: [number, number, number, number] = [0.22, 1, 0.36, 1];
/** スプリングは bouncy 過ぎないよう damping 高め。 */
export const spring: Transition = { type: 'spring', stiffness: 380, damping: 32, mass: 0.7 };
export const springGentle: Transition = { type: 'spring', stiffness: 220, damping: 30, mass: 0.9 };

export const durations = {
  fast: 0.18,
  base: 0.26,
  slow: 0.36,
} as const;

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: durations.slow, ease: easeOut } },
  exit: { opacity: 0, y: -8, transition: { duration: durations.fast, ease: 'easeIn' } },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: durations.base } },
  exit: { opacity: 0, transition: { duration: durations.fast } },
};

/** モーダルなど、中央にポンと出る系。 */
export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.94, y: 8 },
  show: { opacity: 1, scale: 1, y: 0, transition: spring },
  exit: { opacity: 0, scale: 0.97, y: 4, transition: { duration: durations.fast, ease: 'easeIn' } },
};

/** ボトムシート: 下から滑り上がる。 */
export const slideUp: Variants = {
  hidden: { y: '100%' },
  show: { y: 0, transition: springGentle },
  exit: { y: '100%', transition: { duration: durations.base, ease: 'easeIn' } },
};

/** ドロップダウン: 高さと不透明度。 */
export const dropdown: Variants = {
  hidden: { opacity: 0, y: -6, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: durations.base, ease: easeOut } },
  exit: { opacity: 0, y: -4, scale: 0.98, transition: { duration: durations.fast, ease: 'easeIn' } },
};

/** リスト用 stagger コンテナ。 */
export const staggerContainer = (stagger = 0.05): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren: 0.02 } },
  exit: {},
});

/* ===== ページ遷移(iOS push/pop + Material 3 Shared Axis) ===== */

/**
 * ルートの「深さ」。数字が大きいほどドリルダウンした画面。
 * 下部ナビ直結のタブ(ホーム/お知らせ/マイページ)は同格の 1 とし、
 * タブ間の移動は方向を付けず交差フェードにする(iOS のタブ切替と同じ)。
 */
export function routeRank(path: string): number {
  if (path === '/') return 0;
  if (
    path === '/dashboard' ||
    path === '/notifications' ||
    path === '/mypage'
  ) {
    return 1;
  }
  return path.split('/').filter(Boolean).length + 1;
}

/**
 * ページ遷移のバリアント。dir > 0 = 深い画面へ(右から押し込む)、
 * dir < 0 = 戻る(左から戻す)、0 = 同格(フェードスルー)。
 * 入場はスプリングで最後にぬるっと減速し、退場は短く消えて
 * 入場と重なる(mode="popLayout")。待ち時間の空白を作らない。
 */
export const pageVariants: Variants = {
  enter: (dir: number) => ({
    opacity: 0,
    x: dir > 0 ? 28 : dir < 0 ? -28 : 0,
    scale: dir === 0 ? 0.992 : 1,
  }),
  center: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 260,
      damping: 30,
      mass: 0.9,
      opacity: { duration: 0.2, ease: 'linear' },
    },
  },
  exit: (dir: number) => ({
    opacity: 0,
    x: dir > 0 ? -18 : dir < 0 ? 18 : 0,
    transition: { duration: 0.15, ease: [0.4, 0, 1, 1] },
  }),
};
