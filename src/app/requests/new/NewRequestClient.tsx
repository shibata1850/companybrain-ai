'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function NewRequestClient() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [persona, setPersona] = useState('');
  const [materials, setMaterials] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, purpose, persona, materials, notes }),
      });
      const json = (await res.json()) as { ok?: boolean; id?: string; error?: string };
      if (!res.ok || !json.id) throw new Error(json.error || `HTTP ${res.status}`);
      router.push(`/requests/${json.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/requests"
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <path d="M7.5 2.5L4 6l3.5 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        依頼一覧へ
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">新規依頼</h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-500">
          管理者にブレインの作成を依頼します。なるべく具体的に書くと、
          意図に合ったブレインが作られやすくなります。
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-6"
      >
        <div>
          <label className="block text-sm font-medium text-neutral-700">
            希望するブレイン名 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: 経理ヘルプデスク"
            required
            maxLength={80}
            className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700">
            用途・想定する質問 <span className="text-red-500">*</span>
          </label>
          <textarea
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder={'例: 経費精算ルールを答えてほしい。「交通費の上限は?」「接待費の勘定科目は?」のような質問に答える想定。'}
            required
            rows={4}
            className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700">
            希望のペルソナ・口調 <span className="text-neutral-400">(任意)</span>
          </label>
          <textarea
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            placeholder="例: 経理部長の田中さんっぽく、丁寧だがズバッと結論を言う"
            rows={3}
            className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700">
            学習させてほしい素材 <span className="text-neutral-400">(任意)</span>
          </label>
          <textarea
            value={materials}
            onChange={(e) => setMaterials(e.target.value)}
            placeholder="マニュアルや規定の本文をここに貼り付けてください。後で管理者が学習させます。"
            rows={8}
            className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm leading-relaxed focus:border-neutral-900 focus:outline-none"
          />
          <p className="mt-1 text-[11px] text-neutral-400">
            空のままでも構いません。素材は後から管理者と相談してもOKです。
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700">
            補足 <span className="text-neutral-400">(任意)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="納期希望、注意点、参考のURLなど"
            rows={2}
            className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          />
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-full bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50"
        >
          {submitting ? '送信中…' : '依頼を送る'}
        </button>
      </form>
    </div>
  );
}
