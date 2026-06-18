'use client';

import Link from 'next/link';
import { useState } from 'react';
import LoginBackground from '@/components/LoginBackground';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [company, setCompany] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, company }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        signedIn?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      // Full reload so the new session cookie is picked up everywhere.
      window.location.href = json.signedIn ? '/dashboard' : '/login';
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <div className="relative mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center">
      <LoginBackground />
      <Link
        href="/"
        className="fixed left-4 top-[68px] z-20 inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/80 px-3 py-1.5 text-xs font-medium text-indigo-600 shadow-sm backdrop-blur transition hover:border-indigo-300 hover:text-indigo-700 sm:left-6"
      >
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
          <path
            d="M7.5 2.5L4 6l3.5 3.5"
            stroke="currentColor"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        サービス紹介に戻る
      </Link>

      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-neutral-900 text-xl text-white shadow-lg">
          🧠
        </div>
        <h1 className="text-xl font-semibold tracking-tight">無料で始める</h1>
        <p className="mt-1 text-xs text-neutral-500">
          フリープランでアカウントを作成します
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-2xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-indigo-500/5 backdrop-blur-sm"
      >
        <div>
          <label className="block text-sm font-medium text-neutral-700">
            メールアドレス
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
            className="mt-1.5 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">
            会社名 <span className="text-neutral-400">(任意)</span>
          </label>
          <input
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="例: 株式会社サンプル"
            className="mt-1.5 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">
            パスワード <span className="text-neutral-400">(8文字以上)</span>
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
            className="mt-1.5 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          />
        </div>
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-full bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50"
        >
          {submitting ? '作成中…' : '無料で始める'}
        </button>
      </form>

      <div className="mt-4 text-center">
        <Link
          href="/login"
          className="text-xs text-neutral-500 transition hover:text-neutral-900"
        >
          すでにアカウントをお持ちの方はログイン
        </Link>
      </div>
    </div>
  );
}
