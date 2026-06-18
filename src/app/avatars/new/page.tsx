'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

type Mode = 'video' | 'text';

export default function NewAvatarPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('text');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [seedText, setSeedText] = useState('');
  const [seedFolder, setSeedFolder] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  function onPhotoPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setPhoto(f);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(f ? URL.createObjectURL(f) : null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('名前を入力してください');
      return;
    }

    const form = new FormData();
    form.append('name', name);
    if (description) form.append('description', description);

    if (mode === 'video') {
      if (!file) {
        setError('動画ファイルを選択してください');
        return;
      }
      form.append('video', file);
      setProgressLabel(
        '動画をアップロード中… 顔写真とボイスの学習、文字起こしが終わるまで数分かかります。',
      );
    } else {
      // テキスト＋写真モード。どちらも任意だが、片方は入れてもらう想定。
      if (photo) form.append('photo', photo);
      if (seedText.trim()) form.append('text', seedText.trim());
      if (seedFolder.trim()) form.append('folder', seedFolder.trim());
      setProgressLabel(
        seedText.trim()
          ? 'ブレインを作成し、テキストを学習中… 少し時間がかかります。'
          : 'ブレインを作成中…',
      );
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/avatars', { method: 'POST', body: form });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        throw new Error(data.error || `failed: HTTP ${res.status}`);
      }
      router.push(`/avatars/${data.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
      setProgressLabel(null);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <path
            d="M7.5 2.5L4 6l3.5 3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        一覧へ
      </Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          新しいブレインを作る
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-500">
          作り方は2通りあります。動画から顔・声・発言をまとめて学習させるか、
          テキストとアイコン写真だけで手軽に作るか選べます。後から学習素材を
          追加することもできます。
        </p>
      </header>

      {/* Mode toggle */}
      <div className="flex rounded-full bg-neutral-100 p-1 text-sm">
        <button
          type="button"
          onClick={() => setMode('text')}
          className={`flex-1 rounded-full px-4 py-2 font-medium transition ${
            mode === 'text'
              ? 'bg-white text-neutral-900 shadow-sm'
              : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          📝 テキスト＋写真
        </button>
        <button
          type="button"
          onClick={() => setMode('video')}
          className={`flex-1 rounded-full px-4 py-2 font-medium transition ${
            mode === 'video'
              ? 'bg-white text-neutral-900 shadow-sm'
              : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          🎬 動画から
        </button>
      </div>

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

        {mode === 'video' ? (
          <div>
            <label className="block text-sm font-medium text-neutral-700">
              動画ファイル
            </label>
            <input
              type="file"
              accept="video/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1.5 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-neutral-900 file:px-3 file:py-1 file:text-white"
            />
            <p className="mt-1.5 text-xs text-neutral-400">
              正面の顔がはっきり映り、音声がクリアな動画ほど精度が
              上がります。30秒〜2分が目安。
            </p>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium text-neutral-700">
                アイコン写真 <span className="text-neutral-400">(任意)</span>
              </label>
              <div className="mt-1.5 flex items-center gap-3">
                <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-neutral-100 ring-1 ring-neutral-200">
                  {photoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoPreview}
                      alt="プレビュー"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-neutral-400">なし</span>
                  )}
                </div>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={onPhotoPicked}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:border-neutral-900"
                >
                  {photo ? '写真を変更' : '写真を選ぶ'}
                </button>
                {photo && (
                  <button
                    type="button"
                    onClick={() => {
                      setPhoto(null);
                      if (photoPreview) URL.revokeObjectURL(photoPreview);
                      setPhotoPreview(null);
                    }}
                    className="text-xs text-neutral-400 hover:text-neutral-700"
                  >
                    削除
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-xs text-neutral-400">
                正方形に近い写真がきれいに表示されます。作成後にトリミングも
                できます。
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700">
                学習させるテキスト{' '}
                <span className="text-neutral-400">(任意)</span>
              </label>
              <textarea
                value={seedText}
                onChange={(e) => setSeedText(e.target.value)}
                rows={8}
                className="mt-1.5 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm leading-relaxed focus:border-neutral-900 focus:outline-none"
                placeholder="マニュアル・議事録・発言録などを貼り付けてください。後からいくらでも追加できます。"
              />
              <p className="mt-1.5 text-xs text-neutral-400">
                ここで入れた内容はすぐに知識ベースに取り込まれ、会話で参照
                されます。空のままブレインだけ作って、あとで学習させても
                かまいません。
              </p>
            </div>

            {seedText.trim() && (
              <div>
                <label className="block text-sm font-medium text-neutral-700">
                  分類フォルダ <span className="text-neutral-400">(任意)</span>
                </label>
                <input
                  type="text"
                  value={seedFolder}
                  onChange={(e) => setSeedFolder(e.target.value)}
                  placeholder="例: 建築基準法 / 議事録 / マニュアル"
                  className="mt-1.5 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
                />
                <p className="mt-1.5 text-xs text-neutral-400">
                  あとから素材を増やすときに、同じフォルダ名を入れれば
                  ひとまとめにできます。
                </p>
              </div>
            )}
          </>
        )}

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
