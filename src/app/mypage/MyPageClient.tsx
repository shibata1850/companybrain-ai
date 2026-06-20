'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { Plan } from '@/lib/plans';

type Me = {
  email: string;
  role: 'admin' | 'member';
  display_name: string | null;
  avatar_url?: string | null;
};

type Usage = {
  plan: Plan;
  brainsUsed: number;
  questionsThisMonth: number;
  role?: 'admin' | 'member';
};

export default function MyPageClient() {
  const [me, setMe] = useState<Me | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [requestCount, setRequestCount] = useState(0);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setMe(j.user ?? null))
      .catch(() => {});
    fetch('/api/plan', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (j.plan) setUsage(j as Usage);
      })
      .catch(() => {});
    fetch('/api/requests/count', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setRequestCount(j?.count ?? 0))
      .catch(() => {});
  }, []);

  // Prevents double-POST when both onBlur and Enter fire for the same edit.
  const saveNameInFlightRef = useRef(false);
  async function saveName() {
    if (saveNameInFlightRef.current) return;
    saveNameInFlightRef.current = true;
    try {
      const value = nameDraft.trim();
      setSaveError(null);
      const res = await fetch('/api/auth/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: value }),
      });
      if (res.ok) {
        const j = (await res.json()) as { display_name: string | null };
        setMe((m) => (m ? { ...m, display_name: j.display_name } : m));
        setEditingName(false);
      } else {
        // Keep the input open so the user can retry. Surface the failure.
        setSaveError('表示名の保存に失敗しました');
      }
    } finally {
      saveNameInFlightRef.current = false;
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/login';
  }

  const isAdmin = me?.role === 'admin';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">マイページ</h1>

      {/* Profile */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="flex items-center gap-3">
          <AvatarPicker me={me} setMe={setMe} />
          <div className="min-w-0 flex-1">
            {editingName ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveName();
                  else if (e.key === 'Escape') setEditingName(false);
                }}
                placeholder="表示名"
                className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm focus:border-neutral-900 focus:outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setNameDraft(me?.display_name ?? '');
                  setEditingName(true);
                }}
                className="flex items-center gap-1.5 text-left"
                title="表示名を変更(自分だけに反映されます)"
              >
                <span className="text-base font-medium text-neutral-900">
                  {me?.display_name || '表示名を設定'}
                </span>
                <PencilGlyph />
              </button>
            )}
            <p className="truncate text-xs text-neutral-500">{me?.email}</p>
            {saveError && (
              <p className="mt-1 text-[11px] font-bold text-red-600">
                {saveError}
              </p>
            )}
          </div>
          {isAdmin && (
            <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-medium text-white">
              管理者
            </span>
          )}
        </div>
      </section>

      {/* Plan (members only) */}
      {usage && usage.role !== 'admin' && (
        <section className="rounded-2xl border border-neutral-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-neutral-500">現在のプラン</p>
              <p className="text-lg font-semibold tracking-tight">
                {usage.plan.name}
              </p>
            </div>
            <Link
              href="/dashboard"
              className="rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:border-neutral-900 hover:text-neutral-900"
            >
              利用状況・プラン変更
            </Link>
          </div>
        </section>
      )}

      {/* Menu */}
      <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <MenuLink
          href="/requests"
          label="ブレイン作成の依頼"
          badge={requestCount}
        />
        <MenuLink href="/audit" label="監査ログ" />
        <MenuLink href="/trash" label="ゴミ箱" />
        <MenuLink href="/account/password" label="パスワード変更" />
        {isAdmin && (
          <>
            <div className="border-t border-neutral-100 bg-neutral-50/60 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-neutral-500">
              管理者
            </div>
            <MenuLink href="/admin/avatars" label="ユーザーブレイン管理" />
            <MenuLink href="/admin/users" label="ユーザー管理" />
          </>
        )}
      </section>

      <button
        type="button"
        onClick={logout}
        className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-red-600 transition hover:border-red-300 hover:bg-red-50"
      >
        ログアウト
      </button>
    </div>
  );
}

/**
 * Clickable avatar that opens a hidden file input. Uploads the picked
 * image to /api/auth/avatar and refreshes the in-page `me` so the new
 * picture renders immediately. Long-press / right-click to remove.
 */
function AvatarPicker({
  me,
  setMe,
}: {
  me: Me | null;
  setMe: React.Dispatch<React.SetStateAction<Me | null>>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ''; // allow re-uploading the same file
    if (!f) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('photo', f);
      const res = await fetch('/api/auth/avatar', {
        method: 'POST',
        body: fd,
      });
      const j = (await res.json()) as {
        ok?: boolean;
        avatar_url?: string | null;
        error?: string;
      };
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setMe((m) => (m ? { ...m, avatar_url: j.avatar_url ?? null } : m));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!me?.avatar_url) return;
    if (!confirm('プロフィール画像を削除しますか?')) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/avatar', { method: 'DELETE' });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setMe((m) => (m ? { ...m, avatar_url: null } : m));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const url = me?.avatar_url ?? null;
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        title={url ? 'クリックで画像を変更' : 'クリックで画像をアップロード'}
        className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-neutral-900 text-lg text-white shadow ring-1 ring-neutral-200 transition hover:opacity-90 disabled:opacity-50"
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span>
            {(me?.display_name || me?.email || '?').charAt(0).toUpperCase()}
          </span>
        )}
      </button>
      {/* Small camera indicator anchored to the corner so users see
          the avatar is interactive without needing hover. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-neutral-900 text-white ring-2 ring-white"
      >
        <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden>
          <path
            d="M3.5 5.5h2L7 4h2l1.5 1.5h2A1.5 1.5 0 0 1 14 7v5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12V7a1.5 1.5 0 0 1 1.5-1.5z"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinejoin="round"
          />
          <circle cx="8" cy="9.5" r="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </span>
      {url && (
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          title="プロフィール画像を削除"
          className="absolute -top-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-white text-neutral-500 shadow ring-1 ring-neutral-200 transition hover:text-red-600"
        >
          <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden>
            <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={onPick}
        className="sr-only"
      />
      {error && (
        <p className="mt-1 max-w-[180px] text-[10px] font-bold text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

function MenuLink({
  href,
  label,
  badge,
}: {
  href: string;
  label: string;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between border-b border-neutral-100 px-4 py-4 text-sm font-bold text-neutral-900 transition last:border-b-0 hover:bg-neutral-50"
    >
      <span className="flex items-center gap-2">
        {label}
        {!!badge && badge > 0 && (
          <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden className="text-neutral-400">
        <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}

function PencilGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden className="text-neutral-400">
      <path
        d="M11 1.5l3.5 3.5L5 14.5H1.5V11L11 1.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
