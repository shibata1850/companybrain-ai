'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type Member = {
  email: string;
  org_role: 'company_admin' | 'member';
  suspended_at: string | null;
  created_at: string;
};
type Org = { id: string; name: string; seats: number; used: number };

/**
 * 会社管理者(company_admin)向けのメンバー管理画面。自社のシート枠内で
 * メンバーを招待・停止・削除できる。他社は一切見えない。
 */
export default function OrgClient() {
  const [org, setOrg] = useState<Org | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/org', { cache: 'no-store' });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const json = (await res.json()) as {
        org?: Org;
        members?: Member[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setOrg(json.org ?? null);
      setMembers(json.members ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setError(null);
    try {
      const res = await fetch('/api/org/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setEmail('');
      setPassword('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setInviting(false);
    }
  }

  async function setSuspended(target: string, suspend: boolean) {
    setError(null);
    try {
      const res = await fetch('/api/org/members', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: target, suspend }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function remove(target: string) {
    if (!confirm(`${target} を自社から外しますか?\nこのユーザーはログインできなくなり、シートが1つ空きます。`)) return;
    setError(null);
    try {
      const res = await fetch('/api/org/members', {
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
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          この画面は会社管理者のみが利用できます。
          <div className="mt-4">
            <Link href="/mypage" className="text-neutral-900 underline">
              マイページへ戻る
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const seatsFull = !!org && org.used >= org.seats;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {org ? org.name : 'メンバー管理'}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          自社のメンバーを招待・管理します。各メンバーは自分のブレインだけを
          利用でき、内容は会社管理者にも見えません。
        </p>
      </div>

      {org && (
        <div className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white px-5 py-4">
          <span className="text-sm font-bold text-neutral-900">シート利用状況</span>
          <span className="text-sm tabular-nums text-neutral-700">
            <b className={seatsFull ? 'text-amber-700' : 'text-neutral-900'}>
              {org.used}
            </b>{' '}
            / {org.seats} 名
          </span>
        </div>
      )}

      {/* 招待フォーム */}
      <form
        onSubmit={invite}
        className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5"
      >
        <h2 className="text-sm font-bold text-neutral-900">メンバーを招待</h2>
        {seatsFull ? (
          <p className="text-xs text-amber-700">
            シートが上限に達しています。運営者にシート追加をご依頼ください。
          </p>
        ) : (
          <p className="text-[11px] text-neutral-500">
            登録したメールアドレスの人だけがログインできます。初期パスワードを
            設定して本人に伝えてください。
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="メールアドレス"
            required
            disabled={seatsFull}
            className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none disabled:bg-neutral-50"
          />
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="初期パスワード(8文字以上)"
            minLength={8}
            required
            disabled={seatsFull}
            className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none disabled:bg-neutral-50"
          />
          <button
            type="submit"
            disabled={inviting || seatsFull}
            className="rounded-full bg-neutral-900 px-5 py-2 text-sm font-bold text-white transition hover:bg-neutral-700 disabled:opacity-50"
          >
            {inviting ? '招待中…' : '招待する'}
          </button>
        </div>
      </form>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* メンバー一覧 */}
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        {loading ? (
          <p className="py-10 text-center text-sm text-neutral-400">読み込み中…</p>
        ) : members.length === 0 ? (
          <p className="py-10 text-center text-sm text-neutral-400">
            メンバーがいません。
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {members.map((m) => (
              <li
                key={m.email}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <span
                    className={`truncate text-sm ${
                      m.suspended_at
                        ? 'text-neutral-400 line-through'
                        : 'text-neutral-900'
                    }`}
                  >
                    {m.email}
                  </span>
                  {m.org_role === 'company_admin' && (
                    <span className="ml-2 rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      会社管理者
                    </span>
                  )}
                  {m.suspended_at && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                      停止中
                    </span>
                  )}
                </div>
                {m.org_role !== 'company_admin' && (
                  <div className="flex shrink-0 items-center gap-4">
                    <button
                      type="button"
                      onClick={() => setSuspended(m.email, !m.suspended_at)}
                      className="text-xs font-medium text-neutral-500 transition hover:text-neutral-900"
                    >
                      {m.suspended_at ? '再開' : '一時停止'}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(m.email)}
                      className="text-xs font-medium text-neutral-400 transition hover:text-red-600"
                    >
                      外す
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
