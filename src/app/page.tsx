'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

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

  // Re-fetch on every mount AND whenever the tab regains focus, so the
  // list stays in sync no matter how the user navigated here.
  useEffect(() => {
    load();
    function onFocus() {
      load();
    }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

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
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <strong>読み込みエラー:</strong> {error}
        </div>
      )}

      {loading && (
        <div className="text-sm text-neutral-400">読み込み中…</div>
      )}

      {!loading && !error && avatars.length === 0 && (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-16 text-center">
          <p className="text-neutral-500">まだブレインがありません。</p>
          <Link
            href="/avatars/new"
            className="mt-5 inline-block rounded-full bg-neutral-900 px-5 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            最初のブレインを作る
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {avatars.map((a) => (
          <Link
            key={a.id}
            href={`/avatars/${a.id}`}
            className="group overflow-hidden rounded-2xl border border-neutral-200 bg-white transition hover:border-neutral-900 hover:shadow-lg"
          >
            <div className="aspect-[4/3] bg-neutral-100">
              {a.cover_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.cover_url}
                  alt={a.name}
                  className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-neutral-300">
                  no cover
                </div>
              )}
            </div>
            <div className="p-4">
              <h3 className="font-medium tracking-tight">{a.name}</h3>
              {a.description && (
                <p className="mt-1 line-clamp-2 text-sm text-neutral-500">
                  {a.description}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
