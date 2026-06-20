'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { useNavBadges, navItems } from './useNavBadges';

/**
 * Mobile bottom navigation (phones only — hidden on sm+, where the same
 * destinations live in the header via HeaderNav). Three destinations:
 *   質問する  → /dashboard (brain list)
 *   お知らせ  → /notifications (unread badge)
 *   マイページ → /mypage (profile, plan, links, logout)
 * Text-only, bold labels (no icons). Shown only for logged-in users.
 */
export default function BottomNav({ show }: { show: boolean }) {
  const pathname = usePathname() || '';
  const { unread, requestCount } = useNavBadges(show);

  if (!show) return null;

  const items = navItems(pathname, unread, requestCount);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_12px_rgba(0,0,0,0.04)] backdrop-blur sm:hidden">
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
                <motion.span
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                  className="absolute -right-5 -top-2 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
                >
                  {it.badge > 99 ? '99+' : it.badge}
                </motion.span>
              )}
            </span>
            {it.active && (
              <motion.span
                layoutId="bottomnav-indicator"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-neutral-900"
              />
            )}
          </Link>
        ))}
      </div>
    </nav>
  );
}
