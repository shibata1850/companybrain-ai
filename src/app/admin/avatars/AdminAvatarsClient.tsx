'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Row = {
  id: string;
  name: string;
  description: string | null;
  owner_email: string | null;
  created_at: string;
  material_count: number;
  last_activity: string | null;
};

export default function AdminAvatarsClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [q, setQ] = useState('');
  const [owner, setOwner] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/avatars', { cache: 'no-store' });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const json = (await res.json()) as { avatars?: Row[]; error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setRows(json.avatars ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const owners = useMemo(
    () =>
      Array.from(
        new Set(rows.map((r) => r.owner_email).filter(Boolean) as string[]),
      ).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (owner && r.owner_email !== owner) return false;
      if (!needle) return true;
      return (
        r.name.toLowerCase().includes(needle) ||
        (r.owner_email ?? '').toLowerCase().includes(needle) ||
        (r.description ?? '').toLowerCase().includes(needle)
      );
    });
  }, [rows, q, owner]);

  // Group by owner for a tidy overview.
  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of filtered) {
      const key = r.owner_email ?? '(所有者なし)';
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  if (forbidden) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="text-sm text-neutral-600">
          このページは管理者のみアクセスできます。
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-full bg-neutral-900 px-4 py-2 text-sm text-white"
        >
          一覧へ戻る
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <path d="M7.5 2.5L4 6l3.5 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        一覧へ
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">ブレイン管理</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-500">
          全ユーザーのブレインを所有者ごとに一覧します。クリックで各ブレインを
          開けます（管理者は誰のブレインも閲覧・操作できます）。
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-full border border-neutral-300 bg-white px-3 py-1.5">
          <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden className="text-neutral-400">
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ブレイン名・所有者で検索…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400"
          />
        </div>
        <select
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          className="rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-700"
        >
          <option value="">全所有者</option>
          {owners.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <span className="text-xs text-neutral-400">{filtered.length} 件</span>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          エラー: {error}
        </div>
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-neutral-400">読み込み中…</p>
      ) : grouped.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-12 text-center text-sm text-neutral-500">
          ブレインがありません。
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([ownerEmail, list]) => (
            <div key={ownerEmail} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
              <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50 px-4 py-2 text-xs">
                <span className="font-medium text-neutral-700">{ownerEmail}</span>
                <span className="text-neutral-400">{list.length} ブレイン</span>
              </div>
              <ul className="divide-y divide-neutral-50">
                {list.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/avatars/${r.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-neutral-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-neutral-900">
                          {r.name}
                        </p>
                        {r.description && (
                          <p className="truncate text-xs text-neutral-500">
                            {r.description}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-4 text-[11px] text-neutral-400">
                        <span>素材 {r.material_count}</span>
                        <span>
                          {r.last_activity
                            ? `最終利用 ${new Date(r.last_activity).toLocaleDateString('ja-JP')}`
                            : '未利用'}
                        </span>
                        <span className="text-neutral-300">›</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
