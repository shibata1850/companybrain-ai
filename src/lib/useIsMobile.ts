'use client';

import { useEffect, useState } from 'react';

/**
 * Returns true on touch / small-viewport devices. Used to swap
 * keyboard-centric wording (Space / Esc / Enter / click) for
 * touch-friendly wording where the text can't be a CSS-responsive
 * element (e.g. an input `placeholder` attribute).
 *
 * Defaults to false on the server / first paint to avoid hydration
 * mismatches, then resolves on mount.
 */
export default function useIsMobile(query = '(max-width: 640px)'): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [query]);
  return isMobile;
}
