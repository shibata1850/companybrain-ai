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
      '動画をアップロード中… (顔写真とボイスの学習、文字起こしが完了するまで数分かかります)',
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
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">新しいブレインを作る</h1>
        <p className="mt-1 text-sm text-white/60">
          人物が正面を向いて話している動画を1本アップロードしてください。
          顔写真と声のクローンを作成し、話している内容を文字起こしして
          知識ベースに登録します。
        </p>
      </header>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-white/80">
            ブレイン名（人物名・役職など）
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm"
            placeholder="例：田中部長"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-white/80">
            説明（任意）
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm"
            placeholder="例：営業部長・10年の現場経験"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-white/80">
            動画ファイル（mp4 / mov など）
          </label>
          <input
            type="file"
            accept="video/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-indigo-500 file:px-3 file:py-1 file:text-white"
            required
          />
          <p className="mt-1 text-xs text-white/40">
            正面の顔がはっきり映り、音声がクリアな動画ほどクローン精度が
            上がります。30秒〜2分程度がおすすめ。
          </p>
        </div>

        {error && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm">
            {error}
          </div>
        )}

        {submitting && progressLabel && (
          <div className="rounded-md border border-indigo-400/40 bg-indigo-400/10 p-3 text-sm">
            {progressLabel}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-indigo-500 px-4 py-2 text-sm font-medium hover:bg-indigo-400 disabled:opacity-50"
        >
          {submitting ? '作成中…' : 'ブレインを作成する'}
        </button>
      </form>
    </div>
  );
}
