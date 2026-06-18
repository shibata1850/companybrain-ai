'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Plan } from '@/lib/plans';

type Usage = {
  plan: Plan;
  brainsUsed: number;
  questionsThisMonth: number;
  role?: 'admin' | 'member';
};

/**
 * Slim "ご利用状況" strip shown above the brain list. Shows the user's
 * current plan, how many brains they've used, and how many questions
 * they've asked this month — with a tiny progress bar for each.
 */
export default function PlanBanner() {
  const [u, setU] = useState<Usage | null>(null);

  useEffect(() => {
    fetch('/api/plan', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (j.plan) setU(j as Usage);
      })
      .catch(() => {});
  }, []);

  if (!u) return null;
  // Admins have no plan and no limits — no banner.
  if (u.role === 'admin') return null;
  const brainsLimit = u.plan.limits.brains;
  const qLimit = u.plan.limits.monthlyQuestions;
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-neutral-200 bg-gradient-to-br from-white to-neutral-50 px-4 py-3 text-xs">
      <span className="rounded-full bg-neutral-900 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-white">
        {u.plan.name}
      </span>
      <Meter
        label="ブレイン"
        used={u.brainsUsed}
        limit={brainsLimit}
      />
      <Meter
        label="今月の質問"
        used={u.questionsThisMonth}
        limit={qLimit}
      />
      {u.plan.id !== 'pro' && (
        <Link
          href="/#pricing"
          className="ml-auto rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-medium text-neutral-600 transition hover:border-neutral-900 hover:text-neutral-900"
        >
          プラン比較 ↗
        </Link>
      )}
    </section>
  );
}

function Meter({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number | 'unlimited';
}) {
  const isUnlimited = limit === 'unlimited';
  const pct = isUnlimited ? 0 : Math.min(100, (used / Math.max(1, limit)) * 100);
  const warn = pct >= 80;
  return (
    <div className="flex min-w-[180px] flex-1 items-center gap-2">
      <span className="text-neutral-500">{label}</span>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
        {!isUnlimited && (
          <div
            className={`absolute inset-y-0 left-0 transition-all ${
              warn ? 'bg-amber-500' : 'bg-emerald-500'
            }`}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      <span
        className={`tabular-nums ${
          warn ? 'font-medium text-amber-700' : 'text-neutral-700'
        }`}
      >
        {used.toLocaleString()} / {isUnlimited ? '∞' : limit.toLocaleString()}
      </span>
    </div>
  );
}
