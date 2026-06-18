'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import SlideToConfirm from '@/components/SlideToConfirm';

type User = {
  email: string;
  role: 'admin' | 'member';
  admin_label: string | null;
  created_at: string;
  suspended_at: string | null;
  plan: 'free' | 'starter' | 'standard' | 'pro';
};

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
          href="/dashboard"
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
        href="/dashboard"
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
              <li key={u.email} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`truncate text-sm ${
                        u.suspended_at ? 'text-neutral-400 line-through' : 'text-neutral-900'
                      }`}
                    >
                      {u.email}
                    </span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        u.role === 'admin'
                          ? 'bg-neutral-900 text-white'
                          : 'bg-neutral-100 text-neutral-600'
                      }`}
                    >
                      {u.role === 'admin' ? '管理者' : '一般'}
                    </span>
                    {u.suspended_at && (
                      <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                        ⏸ 一時停止中
                      </span>
                    )}
                  </div>
                  <LabelEditor
                    email={u.email}
                    initial={u.admin_label}
                    onSaved={load}
                  />
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <PlanSelect
                    email={u.email}
                    value={u.plan}
                    onSaved={load}
                  />
                  <ResetPasswordButton email={u.email} />
                  <SuspendButton
                    email={u.email}
                    suspended={!!u.suspended_at}
                    onChanged={load}
                  />
                  <button
                    type="button"
                    onClick={() => removeUser(u.email)}
                    className="text-xs text-neutral-400 transition hover:text-red-600"
                  >
                    利用停止
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PlanSelect({
  email,
  value,
  onSaved,
}: {
  email: string;
  value: User['plan'];
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    if (next === value) return;
    setSaving(true);
    try {
      await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, plan: next }),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }
  return (
    <select
      value={value}
      onChange={onChange}
      disabled={saving}
      title="プラン"
      className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-[11px] focus:border-neutral-900 focus:outline-none disabled:opacity-50"
    >
      <option value="free">フリー</option>
      <option value="starter">スターター</option>
      <option value="standard">スタンダード</option>
      <option value="pro">プロ</option>
    </select>
  );
}

/**
 * Two-step suspend / resume action: first tap opens a slide-to-confirm
 * modal, dragging the thumb to the end commits. Suspension is fully
 * reversible — the user's brains, history and allowlist row stay put.
 */
function SuspendButton({
  email,
  suspended,
  onChanged,
}: {
  email: string;
  suspended: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function commit() {
    setError(null);
    try {
      const res = await fetch('/api/admin/users/suspend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, suspend: !suspended }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setOpen(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={
          suspended
            ? 'このユーザーの利用を再開します'
            : 'このユーザーのログインを一時的に止めます。データは消えません'
        }
        className={`text-xs transition ${
          suspended
            ? 'text-green-700 hover:text-green-900'
            : 'text-neutral-400 hover:text-amber-700'
        }`}
      >
        {suspended ? '▶ 再開' : '⏸ 一時停止'}
      </button>
      <SlideToConfirm
        open={open}
        title={suspended ? '利用を再開しますか?' : '一時停止しますか?'}
        description={
          suspended
            ? `${email} のログインを再び許可します。`
            : `${email} は次回ログイン以降ログインできなくなります。ブレインや履歴は残るため、いつでも再開できます。`
        }
        actionLabel={
          error
            ? `失敗: ${error}`
            : suspended
            ? '→ スライドして再開'
            : '→ スライドして一時停止'
        }
        tone={suspended ? 'green' : 'amber'}
        onConfirm={commit}
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
      />
    </>
  );
}

/**
 * Issues a one-shot temporary password for a user who forgot theirs.
 * The plaintext is shown ONCE in a copyable inline panel; closing the
 * panel discards it. The admin should pass it to the user out-of-band.
 */
function ResetPasswordButton({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  const [temp, setTemp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function issue() {
    if (
      !confirm(
        `${email} の仮パスワードを発行しますか?\n現在のパスワードは使えなくなります。`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/users/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const json = (await res.json()) as { password?: string; error?: string };
      if (!res.ok || !json.password) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setTemp(json.password);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (temp) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px]">
        <span className="mr-1.5 text-neutral-500">仮パスワード:</span>
        <code className="select-all rounded bg-white px-1.5 py-0.5 font-mono text-neutral-900">
          {temp}
        </code>
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(temp)}
          className="ml-1.5 text-neutral-500 hover:text-neutral-900"
          title="コピー"
        >
          📋
        </button>
        <button
          type="button"
          onClick={() => setTemp(null)}
          className="ml-1.5 text-neutral-400 hover:text-neutral-900"
          title="閉じる(以後表示できません)"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={issue}
      disabled={busy}
      title="仮パスワードを発行して画面に1度だけ表示します"
      className="text-xs text-neutral-400 transition hover:text-neutral-900 disabled:opacity-50"
    >
      {busy ? '発行中…' : error ? `失敗: ${error}` : '🔑 仮パスワード発行'}
    </button>
  );
}

/**
 * Inline editor for the admin's private label for a user. Saving only
 * sets admin_label — it never touches the user's own display name.
 */
function LabelEditor({
  email,
  initial,
  onSaved,
}: {
  email: string;
  initial: string | null;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, admin_label: draft }),
      });
      setEditing(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="mt-1 flex items-center gap-1">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save();
            else if (e.key === 'Escape') setEditing(false);
          }}
          placeholder="管理用ラベル（例: 営業部 田中）"
          className="w-56 rounded-md border border-neutral-300 px-2 py-1 text-[11px] focus:border-neutral-900 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-md bg-neutral-900 px-2 py-1 text-[10px] font-medium text-white disabled:opacity-50"
        >
          保存
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(initial ?? '');
        setEditing(true);
      }}
      className="mt-0.5 text-[11px] text-neutral-400 transition hover:text-neutral-900"
      title="管理者だけに見えるラベル。本人の表示名には影響しません"
    >
      {initial ? `ラベル: ${initial}` : '＋ 管理用ラベルを付ける'}
    </button>
  );
}
