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
type Brain = { id: string; name: string; last_activity: string | null };

type Me = { email: string; role: 'admin' | 'member' } | null;

export default function AuditClient() {
  const [me, setMe] = useState<Me>(null);
  const [ready, setReady] = useState(false);

  // Drill-down position.
  const [user, setUser] = useState<string | null>(null);
  const [brain, setBrain] = useState<Brain | null>(null);

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        const u = j.user as Me;
        setMe(u);
        // Members skip the user-selection step: they're always themselves.
        if (u && u.role !== 'admin') setUser(u.email);
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  if (!ready) {
    return <p className="py-10 text-center text-sm text-neutral-400">読み込み中…</p>;
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
          {me?.role === 'admin'
            ? 'ユーザーを選び、そのブレインを選ぶと、質問と回答を確認できます。'
            : 'ブレインを選ぶと、自分の質問と回答を確認できます。'}
          <br />
          <span className="text-[11px] text-neutral-400">
            ※ 監査ログは利用者の操作（会話の削除・スレッド削除など）では消えません。
          </span>
        </p>
      </header>

      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-1 text-xs text-neutral-500">
        {me?.role === 'admin' && (
          <>
            <button
              type="button"
              onClick={() => {
                setUser(null);
                setBrain(null);
              }}
              className={`rounded px-1.5 py-0.5 transition hover:bg-neutral-100 ${
                !user ? 'font-medium text-neutral-900' : ''
              }`}
            >
              ユーザー
            </button>
            {user && <span className="text-neutral-300">›</span>}
          </>
        )}
        {user && (
          <>
            <button
              type="button"
              onClick={() => setBrain(null)}
              className={`max-w-[14rem] truncate rounded px-1.5 py-0.5 transition hover:bg-neutral-100 ${
                !brain ? 'font-medium text-neutral-900' : ''
              }`}
            >
              {me?.role === 'admin' ? user : '自分'}のブレイン
            </button>
            {brain && <span className="text-neutral-300">›</span>}
          </>
        )}
        {brain && (
          <span className="max-w-[16rem] truncate rounded px-1.5 py-0.5 font-medium text-neutral-900">
            {brain.name}
          </span>
        )}
      </nav>

      {me?.role === 'admin' && !user ? (
        <UserStep onPick={setUser} />
      ) : !brain ? (
        <BrainStep
          user={user!}
          isAdmin={me?.role === 'admin'}
          onPick={setBrain}
        />
      ) : (
        <EntriesStep user={user!} brain={brain} />
      )}
    </div>
  );
}

/* ---------- Step 1: pick a user (admin) ---------- */
type UserRow = { email: string; label: string | null };
function UserStep({ onPick }: { onPick: (u: string) => void }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    fetch('/api/audit?view=users', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (j.error) throw new Error(j.error);
        setUsers(j.users ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(n) ||
        (u.label ?? '').toLowerCase().includes(n),
    );
  }, [users, q]);

  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;

  return (
    <div className="space-y-3">
      <SearchBar value={q} onChange={setQ} placeholder="ユーザーを検索（名前・メール）…" />
      {filtered.length === 0 ? (
        <Empty msg="ユーザーがいません。" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          <ul className="divide-y divide-neutral-50">
            {filtered.map((u) => (
              <li key={u.email}>
                <button
                  type="button"
                  onClick={() => onPick(u.email)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-neutral-50"
                >
                  <span className="min-w-0">
                    {u.label && (
                      <span className="block truncate text-sm font-medium text-neutral-900">
                        {u.label}
                      </span>
                    )}
                    <span
                      className={`block truncate ${
                        u.label
                          ? 'text-[11px] text-neutral-400'
                          : 'text-sm text-neutral-900'
                      }`}
                    >
                      {u.email}
                    </span>
                  </span>
                  <span className="shrink-0 text-neutral-300">›</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ---------- Step 2: pick a brain ---------- */
function BrainStep({
  user,
  isAdmin,
  onPick,
}: {
  user: string;
  isAdmin?: boolean;
  onPick: (b: Brain) => void;
}) {
  const [brains, setBrains] = useState<Brain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    const params = new URLSearchParams({ view: 'brains' });
    if (isAdmin) params.set('user', user);
    fetch(`/api/audit?${params.toString()}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (j.error) throw new Error(j.error);
        setBrains(j.brains ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user, isAdmin]);

  const filtered = useMemo(
    () =>
      brains.filter((b) =>
        b.name.toLowerCase().includes(q.trim().toLowerCase()),
      ),
    [brains, q],
  );

  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;

  return (
    <div className="space-y-3">
      <SearchBar value={q} onChange={setQ} placeholder="ブレインを検索…" />
      {filtered.length === 0 ? (
        <Empty msg="ブレインがありません。" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          <ul className="divide-y divide-neutral-50">
            {filtered.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => onPick(b)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-neutral-50"
                >
                  <span className="truncate text-sm font-medium text-neutral-900">
                    {b.name}
                  </span>
                  <span className="flex shrink-0 items-center gap-3 text-[11px] text-neutral-400">
                    <span>
                      {b.last_activity
                        ? `最終 ${new Date(b.last_activity).toLocaleDateString('ja-JP')}`
                        : '記録なし'}
                    </span>
                    <span className="text-neutral-300">›</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ---------- Step 3: entries ---------- */
function EntriesStep({ user, brain }: { user: string; brain: Brain }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [onlyEscalation, setOnlyEscalation] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        view: 'entries',
        user,
        avatar: brain.id,
      });
      if (q.trim()) params.set('q', q.trim());
      const res = await fetch(`/api/audit?${params.toString()}`, {
        cache: 'no-store',
      });
      const json = (await res.json()) as { entries?: Entry[]; error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setEntries(json.entries ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [user, brain.id, q]);

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
    const header = ['日時', '役割', '内容', '上長確認'];
    const lines = [header.join(',')];
    for (const e of filtered) {
      const row = [
        new Date(e.created_at).toLocaleString('ja-JP'),
        e.role === 'user' ? '質問' : '回答',
        e.content.replace(/"/g, '""').replace(/\n/g, ' '),
        e.escalation ? '要' : '',
      ];
      lines.push(row.map((c) => `"${c}"`).join(','));
    }
    const blob = new Blob(['﻿' + lines.join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-${brain.name}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBar value={q} onChange={setQ} placeholder="内容で検索…" />
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
      </div>

      {error && <ErrorBox msg={error} />}
      {loading ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <Empty msg="このブレインの記録がありません。" />
      ) : (
        <div className="space-y-5">
          <p className="text-xs text-neutral-400">{filtered.length} 件</p>
          {groups.map((g, gi) => (
            <div
              key={`${g.session ?? 'none'}-${gi}`}
              className="overflow-hidden rounded-2xl border border-neutral-200 bg-white"
            >
              <div className="border-b border-neutral-100 bg-neutral-50 px-4 py-2 text-[11px] text-neutral-500">
                {new Date(g.rows[g.rows.length - 1].created_at).toLocaleString('ja-JP')}
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

/* ---------- shared bits ---------- */
function SearchBar({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex flex-1 items-center gap-2 rounded-full border border-neutral-300 bg-white px-3 py-1.5">
      <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden className="text-neutral-400">
        <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
        <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400"
      />
    </div>
  );
}
function Loading() {
  return <p className="py-10 text-center text-sm text-neutral-400">読み込み中…</p>;
}
function Empty({ msg }: { msg: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-12 text-center text-sm text-neutral-500">
      {msg}
    </div>
  );
}
function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      エラー: {msg}
    </div>
  );
}
