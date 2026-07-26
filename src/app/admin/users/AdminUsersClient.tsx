'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import SlideToConfirm from '@/components/SlideToConfirm';
import ShowMoreButton from '@/components/ShowMoreButton';

type User = {
  email: string;
  role: 'admin' | 'member';
  admin_label: string | null;
  created_at: string;
  suspended_at: string | null;
  plan: 'free' | 'starter' | 'standard' | 'pro';
  company: string | null;
  /** エンタープライズ(組織テナント)の所属。個人アカウントは null。 */
  org_id?: string | null;
  org_role?: 'company_admin' | 'member' | null;
  org_name?: string | null;
};

export default function AdminUsersClient() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  // ユーザーが多くてもページが伸びすぎないよう先頭 PAGE 件だけ表示。
  const USER_PAGE = 20;
  const [visible, setVisible] = useState(USER_PAGE);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [adding, setAdding] = useState(false);

  // 組織(エンタープライズ)ごとの集計: 名前・人数・会社管理者。
  const orgInfo = useMemo(() => {
    const m = new Map<
      string,
      { name: string; count: number; admins: string[] }
    >();
    for (const u of users) {
      if (!u.org_id) continue;
      const e = m.get(u.org_id) ?? {
        name: u.org_name ?? '(名称未設定の組織)',
        count: 0,
        admins: [],
      };
      e.count += 1;
      if (u.org_role === 'company_admin') e.admins.push(u.email);
      m.set(u.org_id, e);
    }
    return m;
  }, [users]);

  // 同じ組織のアカウントを隣り合わせに並べ、つながりが一目で分かるように
  // する。組織所属を先(組織名→会社管理者→メール順)、個人を後に置く。
  const sorted = useMemo(() => {
    const inOrg = users.filter((u) => u.org_id);
    const solo = users.filter((u) => !u.org_id);
    inOrg.sort((a, b) => {
      const an = a.org_name ?? '';
      const bn = b.org_name ?? '';
      if (an !== bn) return an.localeCompare(bn, 'ja');
      const ar = a.org_role === 'company_admin' ? 0 : 1;
      const br = b.org_role === 'company_admin' ? 0 : 1;
      if (ar !== br) return ar - br;
      return a.email.localeCompare(b.email);
    });
    solo.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return [...inOrg, ...solo];
  }, [users]);

  const orgCount = orgInfo.size;
  const orgMemberCount = useMemo(
    () => users.filter((u) => u.org_id).length,
    [users],
  );

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
        {!loading && orgMemberCount > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-neutral-100 bg-neutral-50/70 px-4 py-2.5 text-[11px] text-neutral-600">
            <span className="font-bold text-neutral-800">エンタープライズ</span>
            <span>
              {orgCount} 組織 / {orgMemberCount} 名が所属
            </span>
            <span className="text-neutral-400">
              同じ会社のアカウントはまとめて表示・個人は最後にまとめています
            </span>
          </div>
        )}
        {loading ? (
          <p className="py-8 text-center text-sm text-neutral-400">読み込み中…</p>
        ) : users.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-400">
            ユーザーがいません。
          </p>
        ) : (
          <div>
            {sorted.slice(0, visible).map((u, i, arr) => {
              const prev = arr[i - 1];
              const info = u.org_id ? orgInfo.get(u.org_id) : null;
              const showOrgHeader =
                !!u.org_id && (!prev || prev.org_id !== u.org_id);
              const showSoloHeader = !u.org_id && (!prev || !!prev.org_id);
              return (
                <div key={u.email}>
                  {/* 組織ヘッダー: 同じ会社のアカウントをひとまとまりに見せる */}
                  {showOrgHeader && info && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-indigo-100 bg-indigo-50/60 px-4 py-2">
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 16 16"
                        aria-hidden
                        className="text-indigo-700"
                      >
                        <path
                          d="M3 14V3.5A1.5 1.5 0 0 1 4.5 2h5A1.5 1.5 0 0 1 11 3.5V14M11 6.5h1.5A1.5 1.5 0 0 1 14 8v6M2 14h12M5.5 5h1M8 5h1M5.5 7.5h1M8 7.5h1"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          fill="none"
                          strokeLinecap="round"
                        />
                      </svg>
                      <span className="text-xs font-bold text-indigo-900">
                        {info.name}
                      </span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-indigo-700 ring-1 ring-indigo-200">
                        {info.count} 名
                      </span>
                      {info.admins.length > 0 && (
                        <span className="text-[10px] text-indigo-700/90">
                          会社管理者: {info.admins.join(', ')}
                        </span>
                      )}
                    </div>
                  )}
                  {showSoloHeader && (
                    <div className="border-t border-neutral-100 bg-neutral-50 px-4 py-2">
                      <span className="text-xs font-bold text-neutral-500">
                        個人アカウント
                      </span>
                    </div>
                  )}
                  <div className="flex flex-col gap-3 border-t border-neutral-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`truncate text-sm ${
                            u.suspended_at
                              ? 'text-neutral-400 line-through'
                              : 'text-neutral-900'
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
                        {u.org_id && (
                          <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 ring-1 ring-indigo-200">
                            {u.org_name ?? '組織'}
                          </span>
                        )}
                        {u.org_role === 'company_admin' && (
                          <span className="shrink-0 rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            会社管理者
                          </span>
                        )}
                        {u.suspended_at && (
                          <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                            一時停止中
                          </span>
                        )}
                        {u.company && (
                          <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold text-neutral-600">
                            {u.company}
                          </span>
                        )}
                      </div>
                      <LabelEditor
                        email={u.email}
                        initial={u.admin_label}
                        onSaved={load}
                      />
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t border-neutral-100 pt-2.5 sm:border-t-0 sm:pt-0">
                      {/* 組織所属メンバーの上限はエンタープライズで決まるため、
                          個人プランのセレクトは出さず種別だけ示す。 */}
                      {u.role !== 'admin' &&
                        (u.org_id ? (
                          <span className="rounded-md bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-700 ring-1 ring-indigo-200">
                            エンタープライズ
                          </span>
                        ) : (
                          <PlanSelect
                            email={u.email}
                            value={u.plan}
                            onSaved={load}
                          />
                        ))}
                      {u.role !== 'admin' && (
                        <ResetQuestionsButton email={u.email} />
                      )}
                      <ResetPasswordButton email={u.email} />
                      <SuspendButton
                        email={u.email}
                        suspended={!!u.suspended_at}
                        onChanged={load}
                      />
                      <button
                        type="button"
                        onClick={() => removeUser(u.email)}
                        className="text-xs font-medium text-neutral-400 transition hover:text-red-600"
                      >
                        利用停止
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!loading && !forbidden && users.length > 0 && (
          <ShowMoreButton
            className="mt-3"
            visible={visible}
            total={users.length}
            step={USER_PAGE}
            onMore={() => setVisible((v) => v + USER_PAGE)}
            onCollapse={() => setVisible(USER_PAGE)}
          />
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
        {suspended ? '再開' : '一時停止'}
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
/**
 * 対象ユーザーの「今月の質問回数」を手動でリセットする管理者ボタン。
 * 監査ログは消えず、集計の起点だけが現在時刻に進む。
 */
function ResetQuestionsButton({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reset() {
    if (
      !confirm(
        `${email} の今月の質問回数をリセットしますか?\n以後、質問数の上限は今からの分だけで数えられます。`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/users/reset-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setDone(true);
      setTimeout(() => setDone(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={reset}
        disabled={busy}
        className="text-xs font-medium text-neutral-500 transition hover:text-neutral-900 disabled:opacity-50"
      >
        {busy ? 'リセット中…' : done ? 'リセット済み' : '質問回数リセット'}
      </button>
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </span>
  );
}

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
          className="ml-1.5 font-bold text-neutral-500 hover:text-neutral-900"
          title="コピー"
        >
          コピー
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
      {busy ? '発行中…' : error ? `失敗: ${error}` : '仮パスワード発行'}
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
