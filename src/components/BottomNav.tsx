'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

/**
 * Mobile-first bottom navigation. Three destinations:
 *   質問する  → /dashboard (brain list)
 *   お知らせ  → /notifications (with unread badge)
 *   マイページ → /mypage (profile, plan, links, logout)
 * Text-only, bold labels (no icons). Shown only for logged-in users.
 */
export default function BottomNav({ show }: { show: boolean }) {
  const pathname = usePathname() || '';
  const [unread, setUnread] = useState(0);
  const [requestCount, setRequestCount] = useState(0);

  const loadBadges = useCallback(async () => {
    try {
      const [n, r] = await Promise.all([
        fetch('/api/notifications', { cache: 'no-store' }).then((x) => x.json()),
        fetch('/api/requests/count', { cache: 'no-store' }).then((x) => x.json()),
      ]);
      setUnread(n?.unread_count ?? 0);
      setRequestCount(r?.count ?? 0);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!show) return;
    loadBadges();
    const t = setInterval(loadBadges, 60_000);
    // Refresh immediately when other surfaces (the お知らせ page) change
    // notification state, so the badge doesn't stay stale for up to 60s.
    const onChange = () => {
      loadBadges();
    };
    window.addEventListener('cb-notifications-changed', onChange);
    return () => {
      clearInterval(t);
      window.removeEventListener('cb-notifications-changed', onChange);
    };
  }, [show, loadBadges]);

  if (!show) return null;

  const items = [
    {
      href: '/dashboard',
      label: '質問する',
      active: pathname === '/dashboard' || pathname.startsWith('/avatars'),
    },
    {
      href: '/notifications',
      label: 'お知らせ',
      active: pathname.startsWith('/notifications'),
      badge: unread,
    },
    {
      href: '/mypage',
      label: 'マイページ',
      active:
        pathname.startsWith('/mypage') ||
        pathname.startsWith('/account') ||
        pathname.startsWith('/admin') ||
        pathname.startsWith('/requests') ||
        pathname.startsWith('/audit') ||
        pathname.startsWith('/trash'),
      badge: requestCount,
    },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_12px_rgba(0,0,0,0.04)] backdrop-blur">
      <div className="mx-auto flex max-w-md items-stretch">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            aria-current={it.active ? 'page' : undefined}
            className={`relative flex min-h-[60px] flex-1 flex-col items-center justify-center gap-0.5 py-3 text-[13px] font-bold transition active:scale-95 ${
              it.active
                ? 'text-neutral-900'
                : 'text-neutral-400 hover:text-neutral-700'
            }`}
          >
            <span className="relative">
              {it.label}
              {!!it.badge && it.badge > 0 && (
                <span className="absolute -right-5 -top-2 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {it.badge > 99 ? '99+' : it.badge}
                </span>
              )}
            </span>
            {it.active && (
              <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-neutral-900" />
            )}
          </Link>
        ))}
      </div>
    </nav>
  );
}
