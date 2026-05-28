'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

type BrainOption = {
  id: string;
  name: string;
  description: string | null;
};

export default function BrainSwitcher({
  currentId,
  currentName,
}: {
  currentId: string;
  currentName: string;
}) {
  const [open, setOpen] = useState(false);
  const [brains, setBrains] = useState<BrainOption[]>([]);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function ensureLoaded() {
    if (brains.length > 0 || loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/avatars', { cache: 'no-store' });
      const json = (await res.json()) as { avatars?: BrainOption[] };
      setBrains(json.avatars ?? []);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          ensureLoaded();
        }}
        className="flex items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-neutral-900"
      >
        <span className="max-w-[12rem] truncate">{currentName}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className={`transition ${open ? 'rotate-180' : ''}`}
        >
          <path
            d="M2 4l3 3 3-3"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 z-40 mt-1.5 w-64 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg">
          <div className="max-h-72 overflow-y-auto py-1">
            {loading && (
              <div className="px-3 py-2 text-xs text-neutral-400">
                読み込み中…
              </div>
            )}
            {!loading && brains.length === 0 && (
              <div className="px-3 py-2 text-xs text-neutral-400">
                他にブレインがありません。
              </div>
            )}
            {brains.map((b) => (
              <Link
                key={b.id}
                href={`/avatars/${b.id}`}
                onClick={() => setOpen(false)}
                className={`flex flex-col gap-0.5 px-3 py-2 text-xs transition hover:bg-neutral-50 ${
                  b.id === currentId
                    ? 'bg-neutral-50 font-medium text-neutral-900'
                    : 'text-neutral-700'
                }`}
              >
                <span className="truncate">{b.name}</span>
                {b.description && (
                  <span className="truncate text-[10px] text-neutral-400">
                    {b.description}
                  </span>
                )}
              </Link>
            ))}
          </div>
          <div className="border-t border-neutral-200">
            <Link
              href="/avatars/new"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
            >
              + 新しいブレインを作る
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
