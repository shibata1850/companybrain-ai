'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Req = {
  id: string;
  requester_email: string;
  requester_label?: string | null;
  title: string;
  purpose: string;
  status: '申請中' | '受理' | '対応中' | '完了' | '却下';
  assignee_email: string | null;
  result_avatar_id: string | null;
  created_at: string;
  completed_at: string | null;
};

const STATUSES: Req['status'][] = ['申請中', '受理', '対応中', '完了', '却下'];

export default function RequestsClient() {
  const [me, setMe] = useState<{ email: string; role: 'admin' | 'member' } | null>(null);
  const [requests, setRequests] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'' | Req['status']>('');

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setMe(j.user ?? null))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter) params.set('status', filter);
      const res = await fetch(`/api/requests?${params.toString()}`, {
        cache: 'no-store',
      });
      const json = (await res.json()) as { requests?: Req[]; error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setRequests(json.requests ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { '': requests.length };
    for (const s of STATUSES) c[s] = 0;
    for (const r of requests) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [requests]);

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <path d="M7.5 2.5L4 6l3.5 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        一覧へ
      </Link>

      <header className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            ブレイン作成依頼
          </h1>
          {/* Desktop: inline create button. Mobile: replaced by a FAB. */}
          <Link
            href="/requests/new"
            className="hidden shrink-0 rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 sm:inline-flex"
          >
            ＋ 新規依頼
          </Link>
        </div>
        <p className="max-w-2xl text-sm leading-relaxed text-neutral-500">
          {me?.role === 'admin'
            ? 'ユーザーからの依頼一覧です。詳細を開いて対応してください。'
            : '管理者にブレイン作成を依頼できます。「新規依頼」から内容を送ってください。'}
        </p>
      </header>

      {/* Mobile FAB for thumb-reach. */}
      <Link
        href="/requests/new"
        aria-label="新規依頼"
        className="fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 grid h-14 w-14 place-items-center rounded-full bg-neutral-900 text-white shadow-lg shadow-neutral-900/25 transition active:scale-95 sm:hidden"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </Link>

      <div className="flex flex-wrap gap-1.5 text-xs">
        <FilterButton
          label="すべて"
          active={filter === ''}
          count={counts['']}
          onClick={() => setFilter('')}
        />
        {STATUSES.map((s) => (
          <FilterButton
            key={s}
            label={s}
            active={filter === s}
            count={counts[s] ?? 0}
            onClick={() => setFilter(s)}
          />
        ))}
      </div>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <span>エラー: {error}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="shrink-0 rounded-full border border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-red-700 transition hover:bg-red-100"
          >
            再読み込み
          </button>
        </div>
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-neutral-400">読み込み中…</p>
      ) : requests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-12 text-center text-sm text-neutral-500">
          依頼がありません。
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          <ul className="divide-y divide-neutral-100">
            {requests.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/requests/${r.id}`}
                  className="flex items-start justify-between gap-3 px-4 py-3 transition hover:bg-neutral-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-neutral-900">
                        {r.title}
                      </p>
                      <StatusPill status={r.status} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-neutral-500">
                      {r.purpose}
                    </p>
                    {me?.role === 'admin' && (
                      <p className="mt-1 text-[11px] text-neutral-400">
                        依頼者:{' '}
                        {r.requester_label
                          ? `${r.requester_label}（${r.requester_email}）`
                          : r.requester_email}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[11px] text-neutral-400">
                      {new Date(r.created_at).toLocaleDateString('ja-JP')}
                    </p>
                    {r.assignee_email && (
                      <p className="mt-1 text-[10px] text-neutral-400">
                        担当 {r.assignee_email}
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FilterButton({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 transition ${
        active
          ? 'bg-neutral-900 text-white'
          : 'border border-neutral-300 bg-white text-neutral-600 hover:border-neutral-900'
      }`}
    >
      {label}
      <span
        className={`rounded-full px-1.5 text-[10px] ${
          active ? 'bg-white/20' : 'bg-neutral-100 text-neutral-500'
        }`}
      >
        {count}
      </span>
    </button>
  );
}

export function StatusPill({ status }: { status: Req['status'] }) {
  const style = {
    申請中: 'bg-amber-100 text-amber-800',
    受理: 'bg-emerald-100 text-emerald-800',
    対応中: 'bg-blue-100 text-blue-800',
    完了: 'bg-green-100 text-green-800',
    却下: 'bg-neutral-200 text-neutral-600',
  }[status];
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${style}`}>
      {status}
    </span>
  );
}
