'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function NewAvatarPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError('動画ファイルを選択してください');
      return;
    }
    if (!name.trim()) {
      setError('名前を入力してください');
      return;
    }

    const form = new FormData();
    form.append('video', file);
    form.append('name', name);
    if (description) form.append('description', description);

    setSubmitting(true);
    setError(null);
    setProgressLabel(
      '動画をアップロード中… 顔写真とボイスの学習、文字起こしが終わるまで数分かかります。',
    );

    try {
      const res = await fetch('/api/avatars', { method: 'POST', body: form });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        throw new Error(data.error || `failed: HTTP ${res.status}`);
      }
      router.push(`/avatars/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
      setProgressLabel(null);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          新しいブレインを作る
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-500">
          人物が正面を向いて話している動画を1本アップロードしてください。
          顔写真とボイスのクローン、発言の文字起こしを行い、知識ベースを
          構築します。
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-6"
      >
        <div>
          <label className="block text-sm font-medium text-neutral-700">
            ブレイン名
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            placeholder="例: 田中部長"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700">
            説明 <span className="text-neutral-400">(任意)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-1.5 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            placeholder="例: 営業部長・10年の現場経験"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700">
            動画ファイル
          </label>
          <input
            type="file"
            accept="video/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1.5 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-neutral-900 file:px-3 file:py-1 file:text-white"
            required
          />
          <p className="mt-1.5 text-xs text-neutral-400">
            正面の顔がはっきり映り、音声がクリアな動画ほど精度が
            上がります。30秒〜2分が目安。
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {submitting && progressLabel && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800">
            {progressLabel}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-full bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {submitting ? '作成中…' : 'ブレインを作成する'}
        </button>
      </form>
    </div>
  );
}
