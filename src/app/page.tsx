'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

type Avatar = {
  id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  cover_image_path: string | null;
  created_at: string;
};

export default function HomePage() {
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/avatars', { cache: 'no-store' });
      const json = (await res.json()) as { avatars?: Avatar[]; error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setAvatars(json.avatars ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    function onFocus() {
      load();
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
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">ブレイン</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-500">
          動画から学習した人物に質問すると、その人の口調と知識で答える動画が
          自動生成されます。
        </p>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 anim-fade-in">
          <strong>エラー:</strong> {error}
        </div>
      )}

      {loading && <SkeletonGrid />}

      {!loading && !error && avatars.length === 0 && (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-16 text-center anim-fade-in">
          <p className="text-neutral-500">まだブレインがありません。</p>
          <Link
            href="/avatars/new"
            className="mt-5 inline-block rounded-full bg-neutral-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 active:scale-[0.98]"
          >
            最初のブレインを作る
          </Link>
        </div>
      )}

      {!loading && avatars.length > 0 && (
        <div className="grid grid-cols-1 gap-4 anim-stagger sm:grid-cols-2 lg:grid-cols-3">
          {avatars.map((a) => (
            <BrainCard
              key={a.id}
              avatar={a}
              busy={busyId === a.id}
              removing={removingIds.has(a.id)}
              onTrash={() => moveToTrash(a.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl border border-neutral-200 bg-white"
        >
          <div className="aspect-[4/3] anim-shimmer" />
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
    <div
      ref={rootRef}
      className={`group relative overflow-hidden rounded-2xl border border-neutral-200 bg-white transition duration-200 hover:-translate-y-0.5 hover:border-neutral-900 hover:shadow-lg ${
        removing ? 'anim-fade-out' : ''
      }`}
    >
      <Link
        href={`/avatars/${avatar.id}`}
        className="block"
        aria-label={`${avatar.name} の詳細`}
      >
        <div className="aspect-[4/3] overflow-hidden bg-neutral-100">
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
        <div className="p-4">
          <h3 className="font-medium tracking-tight">{avatar.name}</h3>
          {avatar.description && (
            <p className="mt-1 line-clamp-2 text-sm text-neutral-500">
              {avatar.description}
            </p>
          )}
        </div>
      </Link>

      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenuOpen((o) => !o);
        }}
        aria-label="操作メニュー"
        className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-neutral-700 opacity-0 shadow-sm ring-1 ring-neutral-200 backdrop-blur transition duration-200 hover:bg-white group-hover:opacity-100 group-focus-within:opacity-100"
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
    </div>
  );
}
