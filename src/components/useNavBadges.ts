'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Shared nav-badge state for the bottom nav (mobile) and header nav
 * (desktop): unread notifications and pending brain requests. Polls
 * every 60s and refreshes immediately on the `cb-notifications-changed`
 * event other surfaces dispatch.
 */
export function useNavBadges(show: boolean) {
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
    const onChange = () => loadBadges();
    window.addEventListener('cb-notifications-changed', onChange);
    return () => {
      clearInterval(t);
      window.removeEventListener('cb-notifications-changed', onChange);
    };
  }, [show, loadBadges]);

  return { unread, requestCount };
}

/** Shared destination list + active-route matching for both nav bars. */
export function navItems(pathname: string, unread: number, requestCount: number) {
  return [
    {
      href: '/dashboard',
      label: '質問する',
      active: pathname === '/dashboard' || pathname.startsWith('/avatars'),
      badge: 0,
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
}
