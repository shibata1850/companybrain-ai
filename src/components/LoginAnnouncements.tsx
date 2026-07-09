'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Modal from './motion/Modal';

type N = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  media_url?: string | null;
  media_type?: string | null;
};

// このセッションで既にポップアップを出したか(タブを閉じるまで再表示
// しない)。ログインし直す or 新しいタブを開くと再度チェックされる。
const SESSION_KEY = 'cb-announce-shown';

/**
 * モンスト等のアプリのように、ログイン後の初回に未読のお知らせを
 * ポップアップで順番に見せる。最後まで見て閉じると、表示した未読は
 * まとめて既読になる(以後ベルのバッジもクリア)。
 *
 * 認証済みユーザーのレイアウトにのみマウントされる。
 */
export default function LoginAnnouncements() {
  const [items, setItems] = useState<N[]>([]);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    // セッション中に一度出したらもう出さない。
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return;
    } catch {
      // sessionStorage 不可の環境でもポップアップ自体は動かす
    }
    let cancelled = false;
    fetch('/api/notifications?unread=1', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return;
        const unread = (j.notifications ?? []) as N[];
        if (unread.length === 0) return;
        // 新しい順で届くので、古い順に見せて最後が最新になるようにする。
        setItems([...unread].reverse());
        setIndex(0);
        setOpen(true);
        try {
          sessionStorage.setItem(SESSION_KEY, '1');
        } catch {
          // ignore
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function finish() {
    setOpen(false);
    const ids = items.map((n) => n.id);
    if (ids.length > 0) {
      void fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'read_ids', ids }),
        keepalive: true,
      })
        .then(() => {
          try {
            window.dispatchEvent(new CustomEvent('cb-notifications-changed'));
          } catch {
            // ignore
          }
        })
        .catch(() => {});
    }
  }

  if (items.length === 0) return null;

  const current = items[index];
  const isLast = index >= items.length - 1;

  return (
    <Modal
      open={open}
      onClose={finish}
      ariaLabel="新着のお知らせ"
      panelClassName="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-xl"
    >
      <div className="flex flex-col">
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
            新着のお知らせ
          </span>
          {items.length > 1 && (
            <span className="text-[11px] font-medium text-neutral-400">
              {index + 1} / {items.length}
            </span>
          )}
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.2 }}
            >
              <h3 className="text-lg font-bold text-neutral-900">
                {current.title}
              </h3>
              {current.media_url && current.media_type === 'image' && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={current.media_url}
                  alt=""
                  className="mt-3 max-h-72 w-full rounded-xl object-contain"
                />
              )}
              {current.media_url && current.media_type === 'video' && (
                <video
                  src={current.media_url}
                  controls
                  playsInline
                  className="mt-3 max-h-72 w-full rounded-xl bg-black"
                />
              )}
              {current.body && (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
                  {current.body}
                </p>
              )}
              {current.link && (
                <a
                  href={current.link}
                  className="mt-3 inline-block text-sm font-bold text-indigo-600 underline"
                >
                  詳しく見る
                </a>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Dots */}
        {items.length > 1 && (
          <div className="flex justify-center gap-1.5 pb-2">
            {items.map((n, i) => (
              <span
                key={n.id}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? 'w-4 bg-neutral-900' : 'w-1.5 bg-neutral-300'
                }`}
              />
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-neutral-100 px-5 py-4">
          <button
            type="button"
            onClick={finish}
            className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-xs font-medium text-neutral-500 transition hover:border-neutral-900"
          >
            閉じる
          </button>
          {isLast ? (
            <button
              type="button"
              onClick={finish}
              className="rounded-full bg-neutral-900 px-6 py-2 text-sm font-bold text-white transition hover:bg-neutral-700 active:scale-95"
            >
              確認しました
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIndex((i) => Math.min(items.length - 1, i + 1))}
              className="rounded-full bg-neutral-900 px-6 py-2 text-sm font-bold text-white transition hover:bg-neutral-700 active:scale-95"
            >
              次へ
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
