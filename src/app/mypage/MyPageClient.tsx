'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Plan } from '@/lib/plans';

type Me = {
  email: string;
  role: 'admin' | 'member';
  display_name: string | null;
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

  async function saveName() {
    const value = nameDraft.trim();
    setEditingName(false);
    const res = await fetch('/api/auth/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: value }),
    });
    if (res.ok) {
      const j = (await res.json()) as { display_name: string | null };
      setMe((m) => (m ? { ...m, display_name: j.display_name } : m));
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
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-neutral-900 text-lg text-white">
            {(me?.display_name || me?.email || '?').charAt(0).toUpperCase()}
          </span>
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
