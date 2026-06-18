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
  }, [load]);

  async function markRead(id?: string) {
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(id ? { action: 'read', id } : { action: 'read_all' }),
    });
    await load();
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
                      if (!n.read_at) void markRead(n.id);
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
