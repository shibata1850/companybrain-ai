'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type N = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export default function NotificationsClient() {
  const [items, setItems] = useState<N[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/notifications', { cache: 'no-store' });
      if (!r.ok) return;
      const j = (await r.json()) as { notifications: N[]; unread_count: number };
      setItems(j.notifications ?? []);
      setUnread(j.unread_count ?? 0);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setIsAdmin(j.user?.role === 'admin'))
      .catch(() => {});
  }, [load]);

  async function markRead(id?: string) {
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(id ? { action: 'read', id } : { action: 'read_all' }),
      keepalive: true,
    });
    await load();
    // Let other surfaces (BottomNav badge) refresh immediately
    // without waiting for their 60s poll.
    try {
      window.dispatchEvent(new CustomEvent('cb-notifications-changed'));
    } catch {
      // ignore
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">お知らせ</h1>
        {unread > 0 && (
          <button
            type="button"
            onClick={() => markRead()}
            className="rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:border-neutral-900 hover:text-neutral-900"
          >
            すべて既読
          </button>
        )}
      </header>

      {isAdmin && <Compose onSent={load} />}

      {loading ? (
        <p className="py-12 text-center text-sm text-neutral-400">読み込み中…</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-12 text-center text-sm text-neutral-500">
          お知らせはありません。
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => {
            const inner = (
              <div
                className={`rounded-2xl border p-4 transition ${
                  n.read_at
                    ? 'border-neutral-200 bg-white'
                    : 'border-amber-200 bg-amber-50/50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-neutral-900">
                    {n.title}
                  </p>
                  {!n.read_at && (
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-red-500" />
                  )}
                </div>
                {n.body && (
                  <p className="mt-1 text-sm leading-relaxed text-neutral-600">
                    {n.body}
                  </p>
                )}
                <p className="mt-2 text-[11px] text-neutral-400">
                  {new Date(n.created_at).toLocaleString('ja-JP')}
                </p>
              </div>
            );
            return (
              <li key={n.id}>
                {n.link ? (
                  <Link
                    href={n.link}
                    onClick={() => {
                      // Optimistically flip read state locally so navigation
                      // doesn't race with the PATCH; the await in markRead
                      // updates the badge afterwards.
                      if (!n.read_at) {
                        setItems((prev) =>
                          prev.map((x) =>
                            x.id === n.id
                              ? { ...x, read_at: new Date().toISOString() }
                              : x,
                          ),
                        );
                        setUnread((u) => Math.max(0, u - 1));
                        void markRead(n.id);
                      }
                    }}
                    className="block"
                  >
                    {inner}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (!n.read_at) void markRead(n.id);
                    }}
                    className="block w-full text-left"
                  >
                    {inner}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type AdminUser = { email: string; admin_label: string | null; company: string | null };

/**
 * Admin-only composer: write an announcement to all users or a single
 * user. Members never see this — they can only read notifications.
 */
function Compose({ onSent }: { onSent: () => void }) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [target, setTarget] = useState('all');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open || users.length > 0) return;
    fetch('/api/admin/users', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setUsers(j.users ?? []))
      .catch(() => {});
  }, [open, users.length]);

  async function send() {
    setSending(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, target }),
      });
      const j = (await res.json()) as { ok?: boolean; sent?: number; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setMsg(`${j.sent} 件に送信しました`);
      setTitle('');
      setBody('');
      onSent();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-3 text-sm font-bold text-neutral-700 transition hover:border-neutral-900"
      >
        ＋ お知らせを作成(管理者)
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-neutral-300 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-neutral-900">お知らせを作成</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-neutral-400 hover:text-neutral-900"
        >
          閉じる
        </button>
      </div>

      <div>
        <label className="block text-xs font-bold text-neutral-600">宛先</label>
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
        >
          <option value="all">全ユーザー</option>
          {users.map((u) => (
            <option key={u.email} value={u.email}>
              {u.admin_label || u.company || u.email}({u.email})
            </option>
          ))}
        </select>
      </div>

      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="タイトル"
        maxLength={120}
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="本文(任意)"
        rows={3}
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
      />

      {msg && <p className="text-xs text-neutral-600">{msg}</p>}

      <button
        type="button"
        onClick={send}
        disabled={sending || !title.trim()}
        className="w-full rounded-full bg-neutral-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-neutral-700 disabled:opacity-50"
      >
        {sending ? '送信中…' : '送信する'}
      </button>
    </div>
  );
}
