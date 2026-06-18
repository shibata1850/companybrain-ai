'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type N = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

/**
 * Header bell with unread badge + dropdown panel. Polls every 60s so a
 * notification fired by an admin (e.g. ブレイン譲渡) appears in the
 * recipient's UI without a refresh.
 */
export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<N[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/notifications', { cache: 'no-store' });
      if (!r.ok) return;
      const j = (await r.json()) as { notifications: N[]; unread_count: number };
      setItems(j.notifications ?? []);
      setUnread(j.unread_count ?? 0);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  async function markRead(id?: string) {
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(id ? { action: 'read', id } : { action: 'read_all' }),
    });
    await load();
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex items-center gap-1 rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:border-neutral-900 hover:text-neutral-900"
        title="お知らせ"
      >
        🔔 お知らせ
        {unread > 0 && (
          <span className="ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2 text-xs">
            <span className="font-medium text-neutral-700">お知らせ</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markRead()}
                className="text-neutral-500 transition hover:text-neutral-900"
              >
                すべて既読
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="py-8 text-center text-xs text-neutral-400">
              お知らせはありません
            </p>
          ) : (
            <ul className="max-h-96 divide-y divide-neutral-50 overflow-y-auto">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={`px-4 py-3 text-xs ${
                    n.read_at ? 'bg-white' : 'bg-amber-50/40'
                  }`}
                >
                  <a
                    href={n.link ?? '#'}
                    onClick={() => {
                      if (!n.read_at) void markRead(n.id);
                    }}
                    className="block"
                  >
                    <p className="font-medium text-neutral-900">{n.title}</p>
                    {n.body && (
                      <p className="mt-0.5 text-neutral-600">{n.body}</p>
                    )}
                    <p className="mt-1 text-[10px] text-neutral-400">
                      {new Date(n.created_at).toLocaleString('ja-JP')}
                    </p>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
