'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import PlanBanner from '@/components/PlanBanner';
import SortableGrid from '@/components/SortableGrid';

type Avatar = {
  id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  cover_image_path: string | null;
  created_at: string;
  from_request?: boolean;
};

export default function HomePage() {
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const filteredAvatars = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return avatars;
    return avatars.filter((a) => {
      if (a.name.toLowerCase().includes(q)) return true;
      if (a.description && a.description.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [avatars, search]);

  const lastLoadRef = useRef(0);
  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setError(null);
    try {
      const res = await fetch('/api/avatars', { cache: 'no-store' });
      const json = (await res.json()) as { avatars?: Avatar[]; error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setAvatars(json.avatars ?? []);
      setError(null);
      lastLoadRef.current = Date.now();
    } catch (e) {
      // A background (silent) refresh shouldn't blow away the list with
      // a full-screen error; only surface errors on explicit loads.
      if (!opts?.silent) setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    function onFocus() {
      // Avoid a server refetch wiping the in-progress drag draft if the
      // OS quickly blurs/focuses the window during a long-press drag.
      if (document.querySelector('[data-sort-id].opacity-80')) return;
      // Throttle: skip background refetches that fire within 30s of the
      // last load (re-signing every cover URL on each tab focus was
      // wasteful). Errors stay silent so a flaky network doesn't flash.
      if (Date.now() - lastLoadRef.current < 30_000) return;
      load({ silent: true });
    }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  async function moveToTrash(id: string) {
    setBusyId(id);
    setError(null);
    // Play the exit animation first, then drop the card from the array.
    setRemovingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/avatars/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      await new Promise((r) => setTimeout(r, 180));
      setAvatars((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <div className="space-y-10">
      <section className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">ブレイン</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-500">
            動画から学習した人物に質問すると、その人の口調と知識で答える動画が
            自動生成されます。
          </p>
        </div>
        {/* Desktop: inline create button (top-right is fine with a mouse).
            Mobile: hidden here, replaced by a thumb-reachable FAB below. */}
        <Link
          href="/avatars/new"
          className="mt-1 hidden shrink-0 items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-neutral-700 active:scale-[0.98] sm:inline-flex"
        >
          ＋ 新しいブレイン
        </Link>
      </section>

      {/* Mobile floating action button: primary "create" action sits in
          the bottom-right thumb zone, clear of the bottom nav + home bar. */}
      <Link
        href="/avatars/new"
        aria-label="新しいブレインを作成"
        className="fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 grid h-14 w-14 place-items-center rounded-full bg-neutral-900 text-white shadow-lg shadow-neutral-900/25 transition active:scale-95 sm:hidden"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </Link>

      <PlanBanner />

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 anim-fade-in">
          <span>
            <strong>エラー:</strong> {error}
          </span>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void load();
            }}
            className="shrink-0 rounded-full border border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-red-700 transition hover:bg-red-100"
          >
            再読み込み
          </button>
        </div>
      )}

      {loading && <SkeletonGrid />}

      {!loading && !error && avatars.length === 0 && (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center anim-fade-in sm:p-12">
          <h2 className="text-lg font-bold tracking-tight text-neutral-900">
            ようこそ。最初のブレインを作りましょう
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-neutral-500">
            ブレインは、社内資料や人物の知識を覚えさせた「あなた専用の AI」です。
          </p>
          {/* 3-step onboarding so first-timers know the whole flow. */}
          <ol className="mx-auto mt-6 grid max-w-xl gap-3 text-left sm:grid-cols-3">
            {[
              { n: 1, t: 'ブレインを作る', d: '名前を決めて、資料や動画を登録' },
              { n: 2, t: '質問する', d: '音声やテキストでいつでも質問' },
              { n: 3, t: '頼る', d: '担当者の代わりに答えてくれる' },
            ].map((s) => (
              <li
                key={s.n}
                className="rounded-xl border border-neutral-200 bg-white p-3"
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-neutral-900 text-xs font-bold text-white">
                  {s.n}
                </span>
                <p className="mt-2 text-sm font-bold text-neutral-900">{s.t}</p>
                <p className="mt-0.5 text-xs text-neutral-500">{s.d}</p>
              </li>
            ))}
          </ol>
          <Link
            href="/avatars/new"
            className="mt-6 inline-block rounded-full bg-neutral-900 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-neutral-700 active:scale-[0.98]"
          >
            最初のブレインを作る
          </Link>
        </div>
      )}

      {!loading && avatars.length > 0 && (
        <>
          <div className="flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-3 py-1.5">
            <svg
              width="13"
              height="13"
              viewBox="0 0 16 16"
              aria-hidden
              className="text-neutral-400"
            >
              <circle
                cx="7"
                cy="7"
                r="4.5"
                stroke="currentColor"
                strokeWidth="1.4"
                fill="none"
              />
              <path
                d="M10.5 10.5L14 14"
                stroke="currentColor"
                strokeWidth="1.4"
                fill="none"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="名前や説明で絞り込み…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="text-[11px] text-neutral-400 hover:text-neutral-900"
              >
                ×
              </button>
            )}
            <span className="text-[11px] text-neutral-400">
              {search
                ? `${filteredAvatars.length} / ${avatars.length}`
                : `${avatars.length} 件`}
            </span>
          </div>

          {filteredAvatars.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-12 text-center text-sm text-neutral-500 anim-fade-in">
              「{search}」に一致するブレインがありません。
            </div>
          ) : search ? (
            // Search active: drag-and-drop disabled (visual order is filtered).
            <div className="grid grid-cols-2 gap-3 anim-stagger sm:grid-cols-4 lg:grid-cols-6">
              {filteredAvatars.map((a) => (
                <BrainCard
                  key={a.id}
                  avatar={a}
                  busy={busyId === a.id}
                  removing={removingIds.has(a.id)}
                  onTrash={() => moveToTrash(a.id)}
                />
              ))}
            </div>
          ) : (
            <>
              <p className="text-[11px] text-neutral-400">
                スマホは長押し、PC はドラッグでブレインの並びを変更できます。
              </p>
              <SortableGrid
                ids={avatars.map((a) => a.id)}
                onReorder={(next) => {
                  // Optimistic: reorder locally, persist in background.
                  // On failure, refetch from the server so the visible
                  // order matches the truth instead of silently drifting.
                  const prevOrder = avatars;
                  setAvatars((prev) => {
                    const byId = new Map(prev.map((a) => [a.id, a]));
                    return next
                      .map((id) => byId.get(id))
                      .filter(Boolean) as typeof prev;
                  });
                  void fetch('/api/avatars/order', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: next }),
                  })
                    .then((r) => {
                      if (!r.ok) {
                        setAvatars(prevOrder);
                        setError('並び替えの保存に失敗しました');
                      }
                    })
                    .catch(() => {
                      setAvatars(prevOrder);
                      setError('並び替えの保存に失敗しました');
                    });
                }}
                className="grid grid-cols-2 gap-3 anim-stagger sm:grid-cols-4 lg:grid-cols-6"
              >
                {avatars.map((a) => (
                  <div key={a.id} data-sort-id={a.id}>
                    <BrainCard
                      avatar={a}
                      busy={busyId === a.id}
                      removing={removingIds.has(a.id)}
                      onTrash={() => moveToTrash(a.id)}
                    />
                  </div>
                ))}
              </SortableGrid>
            </>
          )}
        </>
      )}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl border border-neutral-200 bg-white"
        >
          <div className="aspect-square anim-shimmer" />
          <div className="space-y-2 p-4">
            <div className="h-4 w-1/2 rounded anim-shimmer" />
            <div className="h-3 w-3/4 rounded anim-shimmer" />
          </div>
        </div>
      ))}
    </div>
  );
}

function BrainCard({
  avatar,
  busy,
  removing,
  onTrash,
}: {
  avatar: Avatar;
  busy: boolean;
  removing: boolean;
  onTrash: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  return (
    <motion.div
      ref={rootRef}
      whileHover={{ y: -3, boxShadow: '0 12px 28px -10px rgba(0,0,0,0.18)' }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 360, damping: 28 }}
      className={`group relative overflow-hidden rounded-2xl border border-neutral-200 bg-white hover:border-neutral-900 ${
        removing ? 'anim-fade-out' : ''
      }`}
    >
      <Link
        href={`/avatars/${avatar.id}`}
        className="block"
        aria-label={`${avatar.name} の詳細`}
      >
        <div className="aspect-square overflow-hidden bg-neutral-100">
          {avatar.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar.cover_url}
              alt={avatar.name}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-neutral-300">
              no cover
            </div>
          )}
        </div>
        <div className="p-2.5">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-[13px] font-medium tracking-tight">
              {avatar.name}
            </h3>
            {avatar.from_request && (
              <span className="shrink-0 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px] font-medium text-indigo-700">
                依頼
              </span>
            )}
          </div>
          {avatar.description && (
            <p className="mt-0.5 line-clamp-2 text-[11px] text-neutral-500">
              {avatar.description}
            </p>
          )}
        </div>
      </Link>

      {/* Drag handle (only initiator of SortableGrid drags). Sits at
          top-left so it's distinct from the actions menu and so its
          large touch target is easy to grab. */}
      <span
        data-drag-handle
        title="ドラッグで並び替え"
        aria-label="ドラッグで並び替え"
        className="absolute left-1.5 top-1.5 grid h-6 w-6 cursor-grab touch-none place-items-center rounded-full bg-white/90 text-neutral-500 opacity-0 shadow-sm ring-1 ring-neutral-200 backdrop-blur transition group-hover:opacity-100 group-focus-within:opacity-100 active:cursor-grabbing sm:opacity-100"
      >
        <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
          <circle cx="4.5" cy="3.5" r="1" fill="currentColor" />
          <circle cx="9.5" cy="3.5" r="1" fill="currentColor" />
          <circle cx="4.5" cy="7" r="1" fill="currentColor" />
          <circle cx="9.5" cy="7" r="1" fill="currentColor" />
          <circle cx="4.5" cy="10.5" r="1" fill="currentColor" />
          <circle cx="9.5" cy="10.5" r="1" fill="currentColor" />
        </svg>
      </span>

      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenuOpen((o) => !o);
        }}
        aria-label="操作メニュー"
        className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-white/90 text-neutral-700 opacity-0 shadow-sm ring-1 ring-neutral-200 backdrop-blur transition duration-200 hover:bg-white group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <circle cx="3" cy="7" r="1.2" fill="currentColor" />
          <circle cx="7" cy="7" r="1.2" fill="currentColor" />
          <circle cx="11" cy="7" r="1.2" fill="currentColor" />
        </svg>
      </button>

      {menuOpen && (
        <div className="absolute right-2 top-12 z-20 w-44 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg anim-fade-in">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen(false);
              onTrash();
            }}
            disabled={busy}
            className="block w-full px-3 py-2 text-left text-xs text-red-700 transition hover:bg-red-50 disabled:opacity-50"
          >
            {busy ? 'ゴミ箱に移動中…' : 'ゴミ箱に移動'}
          </button>
        </div>
      )}

      {busy && (
        <div className="pointer-events-none absolute inset-0 bg-white/60" />
      )}
    </motion.div>
  );
}
