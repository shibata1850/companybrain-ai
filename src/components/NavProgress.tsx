'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/**
 * Top-of-page indeterminate progress bar that flashes briefly whenever
 * the route changes. Gives the user visual confirmation that something
 * is happening during in-app navigation. Pure CSS animation, no deps.
 */
export default function NavProgress() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const firstRender = useRef(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Don't flash on the very first paint of the app.
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), 600);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [pathname]);

  if (!visible) return null;
  return <div className="cb-nav-progress" aria-hidden />;
}
