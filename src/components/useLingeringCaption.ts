'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 発話字幕の余韻: 元の字幕が空になっても、一定時間(既定2秒)は
 * 直前の文を表示し続ける。言い終わった瞬間に文字が消えて読み切れ
 * ない問題への対処。表示専用の保持で、会話の記録(監査ログ)には
 * 影響しない。新しい字幕が来たら余韻は打ち切って即座に差し替わる。
 */
export function useLingeringCaption(caption: string, holdMs = 2000): string {
  const [held, setHeld] = useState(caption);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (caption) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setHeld(caption);
      return;
    }
    timerRef.current = setTimeout(() => setHeld(''), holdMs);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [caption, holdMs]);
  return held;
}
