'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type User = { email: string; role: 'admin' | 'member'; created_at: string };

export default function AdminUsersClient() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users', { cache: 'no-store' });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const json = (await res.json()) as { users?: User[]; error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setUsers(json.users ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setEmail('');
      setPassword('');
      setRole('member');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  }

  async function removeUser(target: string) {
    if (!confirm(`${target} の利用を停止しますか?`)) return;
    setError(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: target }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

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
        <h1 className="text-2xl font-semibold tracking-tight">ユーザー管理</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-500">
          ここに登録したメールアドレスの人だけがログインできます（招待制）。
          初期パスワードを設定して本人に伝えてください。
        </p>
      </header>

      <form
        onSubmit={addUser}
        className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5"
      >
        <h2 className="text-sm font-semibold text-neutral-900">ユーザーを追加</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="メールアドレス"
            required
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          />
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="初期パスワード（8文字以上）"
            required
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'member' | 'admin')}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="member">一般ユーザー</option>
            <option value="admin">管理者</option>
          </select>
          <button
            type="submit"
            disabled={adding}
            className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50"
          >
            {adding ? '追加中…' : '追加する'}
          </button>
        </div>
      </form>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        {loading ? (
          <p className="py-8 text-center text-sm text-neutral-400">読み込み中…</p>
        ) : users.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-400">
            ユーザーがいません。
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {users.map((u) => (
              <li key={u.email} className="flex items-center justify-between px-4 py-3">
                <div>
                  <span className="text-sm text-neutral-900">{u.email}</span>
                  <span
                    className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      u.role === 'admin'
                        ? 'bg-neutral-900 text-white'
                        : 'bg-neutral-100 text-neutral-600'
                    }`}
                  >
                    {u.role === 'admin' ? '管理者' : '一般'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeUser(u.email)}
                  className="text-xs text-neutral-400 transition hover:text-red-600"
                >
                  利用停止
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
