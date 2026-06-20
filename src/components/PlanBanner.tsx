'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { PLANS, type Plan } from '@/lib/plans';
import Modal from './motion/Modal';
import MotionButton from './motion/MotionButton';

type Usage = {
  plan: Plan;
  brainsUsed: number;
  questionsThisMonth: number;
  role?: 'admin' | 'member';
};

/**
 * Slim "ご利用状況" strip shown above the brain list. Shows the user's
 * current plan + usage, and a 「プラン変更」 button that opens a modal
 * to email the admin (upgrades are arranged manually via invoice).
 */
export default function PlanBanner() {
  const [u, setU] = useState<Usage | null>(null);
  const [email, setEmail] = useState<string>('');
  const [showUpgrade, setShowUpgrade] = useState(false);

  useEffect(() => {
    fetch('/api/plan', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (j.plan) setU(j as Usage);
      })
      .catch(() => {});
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setEmail(j.user?.email ?? ''))
      .catch(() => {});
  }, []);

  if (!u) return null;
  // Admins have no plan and no limits — no banner.
  if (u.role === 'admin') return null;
  const brainsLimit = u.plan.limits.brains;
  const qLimit = u.plan.limits.monthlyQuestions;
  return (
    <section className="rounded-2xl border border-neutral-200 bg-gradient-to-br from-white to-neutral-50 px-4 py-3 text-xs">
      {/* Top row: plan name + change button always on one line. */}
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-neutral-900 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-white">
          {u.plan.name}
        </span>
        <MotionButton
          onClick={() => setShowUpgrade(true)}
          className="rounded-full bg-neutral-900 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-neutral-700"
        >
          プラン変更
        </MotionButton>
      </div>
      {/* Meters stack on mobile, sit inline on wider screens. */}
      <div className="mt-2.5 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
        <Meter label="ブレイン" used={u.brainsUsed} limit={brainsLimit} />
        <Meter label="今月の質問" used={u.questionsThisMonth} limit={qLimit} />
      </div>
      <UpgradeModal
        open={showUpgrade}
        current={u.plan}
        email={email}
        onClose={() => setShowUpgrade(false)}
      />
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
          <motion.div
            className={`absolute inset-y-0 left-0 origin-left rounded-full ${
              warn ? 'bg-amber-500' : 'bg-emerald-500'
            }`}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
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

/**
 * Plan-change modal. Lets the user pick a target plan, then opens a
 * pre-filled email to the admin(s). Billing is invoice/bank transfer,
 * so the admin handles the rest and flips the plan manually.
 */
function UpgradeModal({
  open,
  current,
  email,
  onClose,
}: {
  open: boolean;
  current: Plan;
  email: string;
  onClose: () => void;
}) {
  const [admins, setAdmins] = useState<string[]>([]);
  const [target, setTarget] = useState<Plan>(
    PLANS.find((p) => p.id !== current.id && p.priceJpy > current.priceJpy) ??
      current,
  );

  useEffect(() => {
    fetch('/api/auth/admins', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setAdmins(j.admins ?? []))
      .catch(() => {});
  }, []);

  const mailto = (() => {
    const to = admins.join(',');
    const subject = `【プラン変更申請】${current.name} → ${target.name}`;
    const body = [
      'CompanyBrain のプラン変更を申請します。',
      '',
      `申請者: ${email || '(メールアドレス未取得)'}`,
      `現在のプラン: ${current.name}(¥${current.priceJpy.toLocaleString()}/月)`,
      `希望プラン: ${target.name}(¥${target.priceJpy.toLocaleString()}/月)`,
      '',
      'お支払いは請求書/銀行振込を希望します。',
      '請求先(会社名・部署・担当者)などあればご記入ください:',
      '',
    ].join('\n');
    return `mailto:${to}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
  })();

  return (
    <Modal open={open} onClose={onClose} ariaLabel="プランを変更する">
      <div>
        <div className="border-b border-neutral-100 px-5 py-4">
          <h3 className="text-base font-semibold text-neutral-900">
            プランを変更する
          </h3>
          <p className="mt-1 text-xs text-neutral-500">
            お支払いは請求書/銀行振込です。希望プランを選んで管理者にメールしてください。
          </p>
        </div>

        <div className="space-y-2 px-5 py-4">
          {PLANS.map((p) => {
            const isCurrent = p.id === current.id;
            const selected = p.id === target.id;
            return (
              <button
                key={p.id}
                type="button"
                disabled={isCurrent}
                onClick={() => setTarget(p)}
                className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                  isCurrent
                    ? 'cursor-default border-neutral-200 bg-neutral-50 opacity-60'
                    : selected
                    ? 'border-neutral-900 bg-neutral-50'
                    : 'border-neutral-200 bg-white hover:border-neutral-400'
                }`}
              >
                <div>
                  <p className="text-sm font-medium text-neutral-900">
                    {p.name}
                    {isCurrent && (
                      <span className="ml-2 text-[10px] text-neutral-400">
                        現在のプラン
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-neutral-500">{p.tagline}</p>
                </div>
                <span className="text-sm font-semibold tabular-nums">
                  ¥{p.priceJpy.toLocaleString()}
                  <span className="text-[10px] font-normal text-neutral-400">
                    /月
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-neutral-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-xs font-medium text-neutral-600 transition hover:border-neutral-900"
          >
            閉じる
          </button>
          <a
            href={mailto}
            onClick={onClose}
            className={`rounded-full px-4 py-2 text-xs font-medium text-white transition ${
              target.id === current.id
                ? 'pointer-events-none bg-neutral-300'
                : 'bg-neutral-900 hover:bg-neutral-700'
            }`}
          >
            管理者にメールで申請する
          </a>
        </div>
      </div>
    </Modal>
  );
}
