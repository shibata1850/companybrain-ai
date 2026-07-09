'use client';

/**
 * 一覧を「最初は先頭 N 件だけ表示 → もっと見るで増やす」形にするための
 * 共通ボタン。件数が多くてもページが際限なく縦に伸びないようにする。
 *
 * 呼び出し側は visible(表示数)を state で持ち、リストを
 * items.slice(0, visible) で描画したうえで、その直後にこのボタンを置く。
 */
export default function ShowMoreButton({
  visible,
  total,
  step,
  onMore,
  onCollapse,
  className = '',
}: {
  /** 現在の表示件数 */
  visible: number;
  /** 全件数 */
  total: number;
  /** 「もっと見る」で増やす件数 */
  step: number;
  /** 表示件数を増やす */
  onMore: () => void;
  /** 折りたたむ(初期件数へ戻す)。省略時は折りたたみボタンを出さない */
  onCollapse?: () => void;
  className?: string;
}) {
  const hasMore = visible < total;
  const canCollapse = onCollapse && visible > step;
  if (!hasMore && !canCollapse) return null;

  return (
    <div className={`space-y-1.5 ${className}`}>
      {hasMore && (
        <button
          type="button"
          onClick={onMore}
          className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-bold text-neutral-600 transition hover:border-neutral-900 hover:text-neutral-900"
        >
          もっと見る(残り {total - visible} 件)
        </button>
      )}
      {canCollapse && (
        <button
          type="button"
          onClick={onCollapse}
          className="w-full py-1 text-center text-xs text-neutral-400 transition hover:text-neutral-700"
        >
          折りたたむ
        </button>
      )}
    </div>
  );
}
