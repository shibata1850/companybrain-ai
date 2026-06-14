'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Entry = {
  id: string;
  avatar_id: string | null;
  avatar_name: string | null;
  session_id: string | null;
  actor: string | null;
  role: 'user' | 'agent';
  content: string;
  escalation: { categories?: string[]; hints?: string[] } | null;
  created_at: string;
};

export default function AuditClient() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [actors, setActors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [onlyEscalation, setOnlyEscalation] = useState(false);

  const [isAdmin, setIsAdmin] = useState(false);
  // 'mine' = my own brains' logs; 'all' = every user's (admin only)
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [actorFilter, setActorFilter] = useState('');

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setIsAdmin(j.user?.role === 'admin'))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      params.set('limit', '500');
      if (scope === 'all') {
        params.set('scope', 'all');
        if (actorFilter) params.set('actor', actorFilter);
      }
      const res = await fetch(`/api/audit?${params.toString()}`, {
        cache: 'no-store',
      });
      const json = (await res.json()) as {
        entries?: Entry[];
        actors?: string[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setEntries(json.entries ?? []);
      if (json.actors) setActors(json.actors);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [q, scope, actorFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () => (onlyEscalation ? entries.filter((e) => e.escalation) : entries),
    [entries, onlyEscalation],
  );

  const groups = useMemo(() => {
    const out: { session: string | null; rows: Entry[] }[] = [];
    for (const e of filtered) {
      const last = out[out.length - 1];
      if (last && last.session === e.session_id) last.rows.push(e);
      else out.push({ session: e.session_id, rows: [e] });
    }
    return out;
  }, [filtered]);

  function exportCsv() {
    const header = ['日時', 'ブレイン', '利用者', '役割', '内容', '上長確認', 'セッション'];
    const lines = [header.join(',')];
    for (const e of filtered) {
      const row = [
        new Date(e.created_at).toLocaleString('ja-JP'),
        e.avatar_name ?? '',
        e.actor ?? '',
        e.role === 'user' ? '質問' : '回答',
        e.content.replace(/"/g, '""').replace(/\n/g, ' '),
        e.escalation ? '要' : '',
        e.session_id?.slice(0, 8) ?? '',
      ];
      lines.push(row.map((c) => `"${c}"`).join(','));
    }
    const blob = new Blob(['﻿' + lines.join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
        <h1 className="text-2xl font-semibold tracking-tight">監査ログ</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-500">
          質問と回答の記録です。
          {isAdmin
            ? '「自分」は自分のブレイン、「全ユーザー」は全員の記録です。'
            : '自分のブレインへの記録が残ります。'}
        </p>
      </header>

      {isAdmin && (
        <div className="flex rounded-full bg-neutral-100 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => {
              setScope('mine');
              setActorFilter('');
            }}
            className={`flex-1 rounded-full px-4 py-1.5 transition ${
              scope === 'mine'
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-900'
            }`}
          >
            自分
          </button>
          <button
            type="button"
            onClick={() => setScope('all')}
            className={`flex-1 rounded-full px-4 py-1.5 transition ${
              scope === 'all'
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-900'
            }`}
          >
            全ユーザー
          </button>
        </div>
      )}

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
            placeholder="内容で検索…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400"
          />
        </div>
        {scope === 'all' && actors.length > 0 && (
          <select
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            className="rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-700"
          >
            <option value="">全利用者</option>
            {actors.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={() => setOnlyEscalation((v) => !v)}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
            onlyEscalation
              ? 'bg-amber-100 text-amber-800'
              : 'border border-neutral-300 bg-white text-neutral-600 hover:border-neutral-900'
          }`}
        >
          ⚠️ 上長確認のみ
        </button>
        <button
          type="button"
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:border-neutral-900 disabled:opacity-40"
        >
          CSV書き出し
        </button>
        <button
          type="button"
          onClick={load}
          className="rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:border-neutral-900"
        >
          更新
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          エラー: {error}
        </div>
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-neutral-400">読み込み中…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-12 text-center text-sm text-neutral-500">
          記録がありません。ブレインと会話すると、ここに残ります。
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-xs text-neutral-400">{filtered.length} 件</p>
          {groups.map((g, gi) => (
            <div
              key={`${g.session ?? 'none'}-${gi}`}
              className="overflow-hidden rounded-2xl border border-neutral-200 bg-white"
            >
              <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50 px-4 py-2 text-[11px] text-neutral-500">
                <span className="flex items-center gap-2">
                  <span className="font-medium text-neutral-700">
                    {g.rows[0].avatar_name ?? '(削除されたブレイン)'}
                  </span>
                  {g.rows[0].actor && (
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5">
                      {g.rows[0].actor}
                    </span>
                  )}
                </span>
                <span>
                  {new Date(g.rows[g.rows.length - 1].created_at).toLocaleString('ja-JP')}
                </span>
              </div>
              <ul className="divide-y divide-neutral-50">
                {g.rows
                  .slice()
                  .reverse()
                  .map((e) => (
                    <li key={e.id} className="px-4 py-2.5">
                      <div className="flex items-baseline gap-2">
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            e.role === 'user'
                              ? 'bg-neutral-900 text-white'
                              : 'bg-neutral-100 text-neutral-700'
                          }`}
                        >
                          {e.role === 'user' ? '質問' : '回答'}
                        </span>
                        <span className="flex-1 whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">
                          {e.content}
                        </span>
                        <span className="shrink-0 text-[10px] text-neutral-400">
                          {new Date(e.created_at).toLocaleTimeString('ja-JP', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      {e.escalation && (
                        <div className="mt-1 inline-block rounded bg-amber-50 px-2 py-0.5 text-[10px] text-amber-800">
                          ⚠️ 上長確認推奨
                          {e.escalation.categories &&
                            `（${e.escalation.categories.join(' / ')}）`}
                        </div>
                      )}
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
