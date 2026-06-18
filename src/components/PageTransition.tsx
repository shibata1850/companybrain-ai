'use client';

import { usePathname } from 'next/navigation';

/**
 * Wraps page content and re-keys on every pathname change so the
 * fade-in-up animation replays. The animation is defined globally in
 * globals.css.
 */
export default function PageTransition({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="anim-fade-in-up">
      {children}
    </div>
  );
}
