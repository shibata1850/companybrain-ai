'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BrainSwitcher from '@/components/BrainSwitcher';

type Avatar = {
  id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  heygen_photo_id: string | null;
  heygen_voice_id: string | null;
};

type TrainingVideo = {
  id: string;
  file_name: string | null;
  status: string;
  summary: string | null;
  created_at: string;
};

type Generation = {
  id: string;
  question: string;
  answer: string | null;
  status: string;
  video_url: string | null;
  thumbnail_url: string | null;
  error_message: string | null;
  created_at: string;
};

type DetailResponse = {
  avatar: Avatar;
  training_videos: TrainingVideo[];
  generations: Generation[];
};

type Tab = 'history' | 'training';

export default function AvatarDetail({ id }: { id: string }) {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [trainFile, setTrainFile] = useState<File | null>(null);
  const [training, setTraining] = useState(false);
  const [tab, setTab] = useState<Tab>('history');
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/avatars/${id}`, { cache: 'no-store' });
    const json = (await res.json()) as DetailResponse & { error?: string };
    if (!res.ok) {
      setError(json.error || `HTTP ${res.status}`);
      return;
    }
    setData(json);
  }, [id]);

  useEffect(() => {
    load().catch((e) =>
      setError(e instanceof Error ? e.message : String(e)),
    );
  }, [load]);

  // Polling — see commit history for why this uses a string key not the array.
  const pendingKey = useMemo(() => {
    if (!data) return '';
    return data.generations
      .filter((g) => g.status !== 'ready' && g.status !== 'error')
      .map((g) => g.id)
      .sort()
      .join(',');
  }, [data]);

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!pendingKey) return;
    const pendingIds = pendingKey.split(',');
    pollTimer.current = setInterval(async () => {
      for (const gid of pendingIds) {
        try {
          await fetch(`/api/generations/${gid}`, { cache: 'no-store' });
        } catch {
          // ignore
        }
      }
      await load();
    }, 5000);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [pendingKey, load]);

  async function refresh() {
    if (!data) return;
    for (const g of data.generations) {
      if (g.status !== 'ready' && g.status !== 'error') {
        try {
          await fetch(`/api/generations/${g.id}`, { cache: 'no-store' });
        } catch {
          // ignore
        }
      }
    }
    await load();
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setAsking(true);
    setError(null);
    try {
      const res = await fetch(`/api/avatars/${id}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setQuestion('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAsking(false);
    }
  }

  async function addTrainingVideo(e: React.FormEvent) {
    e.preventDefault();
    if (!trainFile) return;
    const form = new FormData();
    form.append('video', trainFile);
    setTraining(true);
    setError(null);
    try {
      const res = await fetch(`/api/avatars/${id}/train`, {
        method: 'POST',
        body: form,
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setTrainFile(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTraining(false);
    }
  }

  if (error && !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        エラー: {error}
      </div>
    );
  }
  if (!data) {
    return <div className="text-neutral-400">読み込み中…</div>;
  }
  const { avatar, training_videos, generations } = data;

  // Decide which generation owns the hero player.
  // Priority: explicit selection > latest non-error > latest of any kind.
  const focused =
    (focusedId && generations.find((g) => g.id === focusedId)) ||
    generations.find((g) => g.status === 'rendering' || g.status === 'answering') ||
    generations.find((g) => g.status === 'ready') ||
    generations[0] ||
    null;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/"
          className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900"
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
        <BrainSwitcher currentId={avatar.id} currentName={avatar.name} />
      </div>

      <header className="flex items-center gap-3">
        <div className="h-10 w-10 overflow-hidden rounded-full bg-neutral-100 ring-1 ring-neutral-200">
          {avatar.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar.cover_url}
              alt={avatar.name}
              className="h-full w-full object-cover"
            />
          ) : null}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight">
            {avatar.name}
          </h1>
          {avatar.description && (
            <p className="truncate text-xs text-neutral-500">
              {avatar.description}
            </p>
          )}
        </div>
      </header>

      {/* Hero video */}
      <section>
        <HeroStage
          generation={focused}
          coverUrl={avatar.cover_url}
          avatarName={avatar.name}
        />
      </section>

      {/* Subtle question input */}
      <section>
        <form
          onSubmit={ask}
          className="mx-auto flex max-w-3xl items-center gap-2 rounded-full border border-neutral-300 bg-white px-3 py-2 shadow-sm focus-within:border-neutral-900"
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={`${avatar.name} に質問する…`}
            className="flex-1 bg-transparent px-2 py-1 text-sm outline-none placeholder:text-neutral-400"
          />
          <button
            type="submit"
            disabled={asking || !question.trim()}
            className="rounded-full bg-neutral-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
          >
            {asking ? '生成中…' : '送信'}
          </button>
        </form>
        {error && (
          <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-red-600">
            {error}
          </p>
        )}
      </section>

      {/* Tabs */}
      <section>
        <div className="flex items-center justify-between border-b border-neutral-200">
          <div className="flex gap-6">
            <TabButton
              active={tab === 'history'}
              onClick={() => setTab('history')}
            >
              回答履歴
              <Pill>{generations.length}</Pill>
            </TabButton>
            <TabButton
              active={tab === 'training'}
              onClick={() => setTab('training')}
            >
              学習させる
              <Pill>{training_videos.length}</Pill>
            </TabButton>
          </div>
          {tab === 'history' && pendingKey && (
            <button
              type="button"
              onClick={refresh}
              className="text-xs text-neutral-500 hover:text-neutral-900"
            >
              手動で更新
            </button>
          )}
        </div>

        <div className="pt-5">
          {tab === 'history' && (
            <HistoryList
              generations={generations}
              focusedId={focused?.id ?? null}
              onSelect={setFocusedId}
            />
          )}
          {tab === 'training' && (
            <TrainingPanel
              avatarName={avatar.name}
              videos={training_videos}
              trainFile={trainFile}
              onPickFile={setTrainFile}
              onSubmit={addTrainingVideo}
              submitting={training}
            />
          )}
        </div>
      </section>
    </div>
  );
}

function HeroStage({
  generation,
  coverUrl,
  avatarName,
}: {
  generation: Generation | null;
  coverUrl: string | null;
  avatarName: string;
}) {
  // No generations at all yet.
  if (!generation) {
    return (
      <div className="relative mx-auto aspect-video w-full max-w-3xl overflow-hidden rounded-3xl border border-neutral-200 bg-neutral-50">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt={avatarName}
            className="h-full w-full object-cover opacity-90"
          />
        ) : null}
        <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/40 via-transparent">
          <div className="w-full p-6 text-white">
            <p className="text-sm font-medium">質問してみましょう</p>
            <p className="mt-1 text-xs text-white/70">
              下のフォームに質問を入力すると、{avatarName} が答える動画が
              生成されます。
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Ready: show the actual video.
  if (generation.status === 'ready' && generation.video_url) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-3">
        <div className="overflow-hidden rounded-3xl border border-neutral-200 bg-black">
          <video
            key={generation.id}
            controls
            autoPlay
            src={generation.video_url}
            poster={generation.thumbnail_url ?? undefined}
            className="aspect-video w-full bg-black"
          />
        </div>
        <div className="px-1">
          <p className="text-xs uppercase tracking-wider text-neutral-400">
            質問
          </p>
          <p className="mt-1 text-sm font-medium">{generation.question}</p>
          {generation.answer && (
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-neutral-600">
              {generation.answer}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Error.
  if (generation.status === 'error') {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-3">
        <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-3xl border border-red-200 bg-red-50 px-8 text-center text-sm text-red-700">
          動画の生成に失敗しました
          <br />
          <span className="text-xs">
            {generation.error_message || '不明なエラー'}
          </span>
        </div>
        <div className="px-1">
          <p className="text-xs uppercase tracking-wider text-neutral-400">
            質問
          </p>
          <p className="mt-1 text-sm font-medium">{generation.question}</p>
        </div>
      </div>
    );
  }

  // Rendering / answering.
  const elapsedSec = Math.max(
    0,
    Math.round((Date.now() - new Date(generation.created_at).getTime()) / 1000),
  );
  const elapsedLabel =
    elapsedSec < 60
      ? `${elapsedSec}秒経過`
      : `${Math.floor(elapsedSec / 60)}分${elapsedSec % 60}秒経過`;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-3">
      <div className="relative aspect-video w-full overflow-hidden rounded-3xl border border-neutral-200 bg-neutral-900">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt={avatarName}
            className="h-full w-full object-cover opacity-40"
          />
        ) : null}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-white" />
            <span className="text-sm font-medium">動画を生成中</span>
          </div>
          <p className="text-xs text-white/70">
            {generation.status === 'answering'
              ? 'Gemini が回答を考えています'
              : `HeyGen がレンダリング中 — ${elapsedLabel}`}
          </p>
        </div>
      </div>
      <div className="px-1">
        <p className="text-xs uppercase tracking-wider text-neutral-400">
          質問
        </p>
        <p className="mt-1 text-sm font-medium">{generation.question}</p>
        {generation.answer && (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-neutral-600">
            {generation.answer}
          </p>
        )}
      </div>
    </div>
  );
}

function HistoryList({
  generations,
  focusedId,
  onSelect,
}: {
  generations: Generation[];
  focusedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (generations.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-neutral-400">
        まだ質問がありません。
      </p>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {generations.map((g) => {
        const isFocused = g.id === focusedId;
        return (
          <li key={g.id}>
            <button
              type="button"
              onClick={() => onSelect(g.id)}
              className={`flex w-full gap-3 rounded-xl border p-3 text-left transition ${
                isFocused
                  ? 'border-neutral-900 bg-neutral-50'
                  : 'border-neutral-200 bg-white hover:border-neutral-400'
              }`}
            >
              <div className="relative h-16 w-24 flex-none overflow-hidden rounded-lg bg-neutral-100">
                {g.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={g.thumbnail_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="grid h-full place-items-center text-[10px] text-neutral-400">
                    <StatusGlyph status={g.status} />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium text-neutral-900">
                  {g.question}
                </p>
                <p className="mt-1 text-[11px] text-neutral-400">
                  {new Date(g.created_at).toLocaleString('ja-JP')}
                </p>
                <StatusBadge status={g.status} />
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function TrainingPanel({
  avatarName,
  videos,
  trainFile,
  onPickFile,
  onSubmit,
  submitting,
}: {
  avatarName: string;
  videos: TrainingVideo[];
  trainFile: File | null;
  onPickFile: (f: File | null) => void;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
}) {
  return (
    <div className="space-y-6">
      <form
        onSubmit={onSubmit}
        className="rounded-2xl border border-neutral-200 bg-white p-5"
      >
        <p className="text-sm font-medium text-neutral-900">
          追加で学習させる
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          {avatarName} が話している動画を追加するほど、回答内容が本人らしく
          なります。顔と声は最初の動画で確定しています。
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="file"
            accept="video/*"
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-neutral-900 file:px-3 file:py-1 file:text-white"
          />
          <button
            type="submit"
            disabled={!trainFile || submitting}
            className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
          >
            {submitting ? '学習中…' : '学習させる'}
          </button>
        </div>
      </form>

      <div>
        <p className="text-xs uppercase tracking-wider text-neutral-400">
          学習済み動画
        </p>
        {videos.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">
            まだ学習動画がありません。
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {videos.map((v) => (
              <li
                key={v.id}
                className="rounded-xl border border-neutral-200 bg-white p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm text-neutral-800">
                    {v.file_name ?? v.id}
                  </span>
                  <StatusBadge status={v.status} />
                </div>
                {v.summary && (
                  <p className="mt-2 text-xs leading-relaxed text-neutral-500">
                    {v.summary}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px flex items-center gap-1.5 border-b-2 px-1 pb-3 text-sm transition ${
        active
          ? 'border-neutral-900 text-neutral-900'
          : 'border-transparent text-neutral-500 hover:text-neutral-900'
      }`}
    >
      {children}
    </button>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-neutral-100 px-1.5 text-[10px] font-medium text-neutral-500">
      {children}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    ready: {
      label: '完成',
      cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    },
    rendering: {
      label: '生成中',
      cls: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
    },
    answering: {
      label: '回答作成中',
      cls: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
    },
    pending: {
      label: '待機中',
      cls: 'bg-neutral-100 text-neutral-600 ring-neutral-200',
    },
    processing: {
      label: '処理中',
      cls: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
    },
    error: {
      label: 'エラー',
      cls: 'bg-red-50 text-red-700 ring-red-200',
    },
  };
  const s = map[status] || {
    label: status,
    cls: 'bg-neutral-100 text-neutral-600 ring-neutral-200',
  };
  return (
    <span
      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${s.cls}`}
    >
      {s.label}
    </span>
  );
}

function StatusGlyph({ status }: { status: string }) {
  if (status === 'error') return <span>!</span>;
  if (status === 'ready') return <span>▶</span>;
  return <span className="animate-pulse">●</span>;
}
