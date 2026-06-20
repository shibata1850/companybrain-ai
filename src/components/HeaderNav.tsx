'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { useNavBadges, navItems } from './useNavBadges';

/**
 * Desktop navigation (sm+ only — phones use the fixed BottomNav). Sits
 * in the global header for logged-in users so the page bottom is free
 * of any fixed bar and scrolls cleanly. Mirrors BottomNav's three
 * destinations and unread / pending badges.
 */
export default function HeaderNav({ show }: { show: boolean }) {
  const pathname = usePathname() || '';
  const { unread, requestCount } = useNavBadges(show);

  if (!show) return null;

  const items = navItems(pathname, unread, requestCount);

  return (
    <nav className="hidden items-center gap-1 sm:flex">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          aria-current={it.active ? 'page' : undefined}
          className={`relative rounded-full px-3 py-1.5 text-sm font-bold transition ${
            it.active
              ? 'text-white'
              : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          {it.active && (
            <motion.span
              layoutId="headernav-active-pill"
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="absolute inset-0 -z-10 rounded-full bg-neutral-900"
            />
          )}
          {it.label}
          {!!it.badge && it.badge > 0 && (
            <motion.span
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              className="absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
            >
              {it.badge > 99 ? '99+' : it.badge}
            </motion.span>
          )}
        </Link>
      ))}
    </nav>
  );
}
