'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

/**
 * Mobile-first bottom navigation. Three destinations:
 *   質問する  → /dashboard (brain list)
 *   お知らせ  → /notifications (with unread badge)
 *   マイページ → /mypage (profile, plan, links, logout)
 * Rendered only for logged-in users (the layout passes `show`).
 */
export default function BottomNav({ show }: { show: boolean }) {
  const pathname = usePathname() || '';
  const [unread, setUnread] = useState(0);

  const loadUnread = useCallback(async () => {
    try {
      const r = await fetch('/api/notifications', { cache: 'no-store' });
      if (!r.ok) return;
      const j = (await r.json()) as { unread_count?: number };
      setUnread(j.unread_count ?? 0);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!show) return;
    loadUnread();
    const t = setInterval(loadUnread, 60_000);
    return () => clearInterval(t);
  }, [show, loadUnread, pathname]);

  if (!show) return null;

  const items = [
    {
      href: '/dashboard',
      label: '質問する',
      active: pathname === '/dashboard' || pathname.startsWith('/avatars'),
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8A2.5 2.5 0 0 1 17.5 16H9l-4 4v-4H6.5" />
          <path d="M8.5 8h7M8.5 11h4" />
        </svg>
      ),
    },
    {
      href: '/notifications',
      label: 'お知らせ',
      active: pathname.startsWith('/notifications'),
      badge: unread,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6.2H4c.5-.7 2-2.2 2-6.2Z" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
      ),
    },
    {
      href: '/mypage',
      label: 'マイページ',
      active: pathname.startsWith('/mypage') || pathname.startsWith('/account') || pathname.startsWith('/admin') || pathname.startsWith('/requests') || pathname.startsWith('/audit') || pathname.startsWith('/trash'),
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" />
        </svg>
      ),
    },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-md items-stretch">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className={`relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition ${
              it.active ? 'text-neutral-900' : 'text-neutral-400 hover:text-neutral-700'
            }`}
          >
            <span className="relative">
              {it.icon}
              {!!it.badge && it.badge > 0 && (
                <span className="absolute -right-2 -top-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-semibold text-white">
                  {it.badge > 99 ? '99+' : it.badge}
                </span>
              )}
            </span>
            {it.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
