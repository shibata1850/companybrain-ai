'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BrainSwitcher from '@/components/BrainSwitcher';
import { MicButton } from '@/components/MicButton';

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
  mime_type: string | null;
  status: string;
  summary: string | null;
  transcript: string | null;
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
  const router = useRouter();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [trainFile, setTrainFile] = useState<File | null>(null);
  const [training, setTraining] = useState(false);
  const [trainText, setTrainText] = useState('');
  const [trainTextTitle, setTrainTextTitle] = useState('');
  const [trainingText, setTrainingText] = useState(false);
  const [tab, setTab] = useState<Tab>('history');
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  async function moveToTrash() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/avatars/${id}`, { method: 'DELETE' });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      router.push('/');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDeleting(false);
    }
  }

  async function addTrainingText(e: React.FormEvent) {
    e.preventDefault();
    if (!trainText.trim()) return;
    setTrainingText(true);
    setError(null);
    try {
      const res = await fetch(`/api/avatars/${id}/train-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: trainText,
          title: trainTextTitle.trim() || undefined,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setTrainText('');
      setTrainTextTitle('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTrainingText(false);
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
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 anim-fade-in">
        エラー: {error}
      </div>
    );
  }
  if (!data) {
    return <DetailSkeleton />;
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
        <div className="flex items-center gap-2">
          <BrainSwitcher currentId={avatar.id} currentName={avatar.name} />
          <AvatarMenu onDelete={moveToTrash} deleting={deleting} />
        </div>
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
        <div key={focused?.id ?? 'empty'} className="anim-fade-in">
          <HeroStage
            generation={focused}
            coverUrl={avatar.cover_url}
            avatarName={avatar.name}
          />
        </div>
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
          <MicButton
            disabled={asking}
            onTranscript={(text) => setQuestion(text)}
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

        <div key={tab} className="pt-5 anim-fade-in-up">
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
              onSubmitVideo={addTrainingVideo}
              submittingVideo={training}
              trainText={trainText}
              onChangeText={setTrainText}
              trainTextTitle={trainTextTitle}
              onChangeTextTitle={setTrainTextTitle}
              onSubmitText={addTrainingText}
              submittingText={trainingText}
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
          <AnswerDisclosure answer={generation.answer} />
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
        <AnswerDisclosure answer={generation.answer} />
      </div>
    </div>
  );
}

function AnswerDisclosure({ answer }: { answer: string | null }) {
  const [open, setOpen] = useState(false);
  if (!answer) return null;
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] text-neutral-600 hover:border-neutral-900"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className={`transition ${open ? 'rotate-90' : ''}`}
          aria-hidden
        >
          <path
            d="M3 2l4 3-4 3"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {open ? '回答テキストを閉じる' : '回答テキストを見る'}
      </button>
      {open && (
        <p className="mt-2 whitespace-pre-wrap rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm leading-relaxed text-neutral-700">
          {answer}
        </p>
      )}
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
    <ul className="grid grid-cols-1 gap-3 anim-stagger sm:grid-cols-2">
      {generations.map((g) => (
        <HistoryItem
          key={g.id}
          generation={g}
          focused={g.id === focusedId}
          onSelect={() => onSelect(g.id)}
        />
      ))}
    </ul>
  );
}

function HistoryItem({
  generation,
  focused,
  onSelect,
}: {
  generation: Generation;
  focused: boolean;
  onSelect: () => void;
}) {
  const [openAnswer, setOpenAnswer] = useState(false);
  return (
    <li
      className={`flex flex-col gap-2 rounded-xl border p-3 transition ${
        focused
          ? 'border-neutral-900 bg-neutral-50'
          : 'border-neutral-200 bg-white hover:border-neutral-400'
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full gap-3 text-left"
      >
        <div className="relative h-16 w-24 flex-none overflow-hidden rounded-lg bg-neutral-100">
          {generation.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={generation.thumbnail_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="grid h-full place-items-center text-[10px] text-neutral-400">
              <StatusGlyph status={generation.status} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium text-neutral-900">
            {generation.question}
          </p>
          <p className="mt-1 text-[11px] text-neutral-400">
            {new Date(generation.created_at).toLocaleString('ja-JP')}
          </p>
          <StatusBadge status={generation.status} />
        </div>
      </button>

      {generation.answer && (
        <div className="pl-[6.75rem]">
          <button
            type="button"
            onClick={() => setOpenAnswer((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] text-neutral-600 transition hover:border-neutral-900"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              className={`transition ${openAnswer ? 'rotate-90' : ''}`}
              aria-hidden
            >
              <path
                d="M3 2l4 3-4 3"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {openAnswer ? '回答テキストを閉じる' : '回答テキストを見る'}
          </button>
          {openAnswer && (
            <p className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-lg border border-neutral-200 bg-white p-3 text-xs leading-relaxed text-neutral-700 anim-fade-in">
              {generation.answer}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function TrainingPanel({
  avatarName,
  videos,
  trainFile,
  onPickFile,
  onSubmitVideo,
  submittingVideo,
  trainText,
  onChangeText,
  trainTextTitle,
  onChangeTextTitle,
  onSubmitText,
  submittingText,
}: {
  avatarName: string;
  videos: TrainingVideo[];
  trainFile: File | null;
  onPickFile: (f: File | null) => void;
  onSubmitVideo: (e: React.FormEvent) => void;
  submittingVideo: boolean;
  trainText: string;
  onChangeText: (v: string) => void;
  trainTextTitle: string;
  onChangeTextTitle: (v: string) => void;
  onSubmitText: (e: React.FormEvent) => void;
  submittingText: boolean;
}) {
  const [mode, setMode] = useState<'video' | 'text'>('video');
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-neutral-900">
              追加で学習させる
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              {avatarName} の発言や知識を追加するほど、回答が本人らしく
              なります。顔と声は最初の動画で確定しています。
            </p>
          </div>
          <div className="flex shrink-0 rounded-full bg-neutral-100 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode('video')}
              className={`rounded-full px-3 py-1 transition ${
                mode === 'video'
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              動画
            </button>
            <button
              type="button"
              onClick={() => setMode('text')}
              className={`rounded-full px-3 py-1 transition ${
                mode === 'text'
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              テキスト
            </button>
          </div>
        </div>

        {mode === 'video' ? (
          <form
            onSubmit={onSubmitVideo}
            className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <input
              type="file"
              accept="video/*"
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
              className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-neutral-900 file:px-3 file:py-1 file:text-white"
            />
            <button
              type="submit"
              disabled={!trainFile || submittingVideo}
              className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
            >
              {submittingVideo ? '学習中…' : '動画から学習'}
            </button>
          </form>
        ) : (
          <form onSubmit={onSubmitText} className="mt-4 space-y-3">
            <input
              type="text"
              value={trainTextTitle}
              onChange={(e) => onChangeTextTitle(e.target.value)}
              placeholder="タイトル(任意): 営業方針 / 業務マニュアル など"
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            />
            <textarea
              value={trainText}
              onChange={(e) => onChangeText(e.target.value)}
              rows={6}
              placeholder={`${avatarName} の考え方や知識をテキストで貼り付けてください。\n例: 議事録、メモ、ブログ記事、社内資料の本文 など`}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm leading-relaxed focus:border-neutral-900 focus:outline-none"
            />
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-neutral-400">
                {trainText.length.toLocaleString()} 文字
              </p>
              <button
                type="submit"
                disabled={!trainText.trim() || submittingText}
                className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
              >
                {submittingText ? '学習中…' : 'テキストから学習'}
              </button>
            </div>
          </form>
        )}
      </div>

      <div>
        <p className="text-xs uppercase tracking-wider text-neutral-400">
          学習素材
        </p>
        {videos.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">
            まだ学習素材がありません。
          </p>
        ) : (
          <ul className="mt-3 space-y-2 anim-stagger">
            {videos.map((v) => (
              <TrainingMaterialCard key={v.id} material={v} />
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

function TrainingMaterialCard({ material }: { material: TrainingVideo }) {
  const router = useRouter();
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState(material.file_name ?? '');
  const [transcript, setTranscript] = useState(material.transcript ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isText = material.mime_type?.startsWith('text/');

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/training-videos/${material.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_name: title,
          transcript,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setMode('view');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/training-videos/${material.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      await new Promise((r) => setTimeout(r, 180));
      setRemoved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDeleting(false);
    }
  }

  if (removed) return null;

  if (mode === 'edit') {
    return (
      <li className="rounded-xl border border-neutral-300 bg-white p-3 anim-fade-in">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${
              isText
                ? 'bg-amber-50 text-amber-700 ring-amber-200'
                : 'bg-sky-50 text-sky-700 ring-sky-200'
            }`}
          >
            {isText ? 'テキスト' : '動画'}
          </span>
          <span className="text-xs text-neutral-400">編集中</span>
        </div>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="タイトル"
          className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
        />
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={8}
          placeholder="本文・文字起こし"
          className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm leading-relaxed focus:border-neutral-900 focus:outline-none"
        />
        {error && (
          <p className="mt-2 text-xs text-red-600">{error}</p>
        )}
        <div className="mt-3 flex items-center justify-between">
          <p className="text-[11px] text-neutral-400">
            本文を変更すると、保存時に自動で再ベクトル化されます。
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setMode('view');
                setTitle(material.file_name ?? '');
                setTranscript(material.transcript ?? '');
                setError(null);
              }}
              disabled={saving}
              className="rounded-full border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 transition hover:border-neutral-900"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-700 disabled:opacity-40"
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li
      className={`rounded-xl border border-neutral-200 bg-white p-3 transition ${
        deleting ? 'anim-fade-out' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${
              isText
                ? 'bg-amber-50 text-amber-700 ring-amber-200'
                : 'bg-sky-50 text-sky-700 ring-sky-200'
            }`}
          >
            {isText ? 'テキスト' : '動画'}
          </span>
          <span className="truncate text-sm text-neutral-800">
            {material.file_name ?? material.id}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={material.status} />
          <MaterialMenu
            onEdit={() => {
              setMode('edit');
              setExpanded(true);
            }}
            onDelete={() => setConfirmDelete(true)}
          />
        </div>
      </div>

      {material.summary && !expanded && (
        <p className="mt-2 text-xs leading-relaxed text-neutral-500">
          {material.summary}
        </p>
      )}

      {material.transcript && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-900"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            className={`transition ${expanded ? 'rotate-90' : ''}`}
            aria-hidden
          >
            <path
              d="M3 2l4 3-4 3"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {expanded ? '本文を閉じる' : '本文を見る'}
        </button>
      )}

      {expanded && material.transcript && (
        <p className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-700 anim-fade-in">
          {material.transcript}
        </p>
      )}

      {confirmDelete && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 anim-fade-in">
          <span>この学習素材を削除します。元に戻せません。</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
              className="rounded-full bg-white px-3 py-1 text-[11px] text-neutral-700"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={doDelete}
              disabled={deleting}
              className="rounded-full bg-red-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-red-500 disabled:opacity-50"
            >
              {deleting ? '削除中…' : '削除する'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      )}
    </li>
  );
}

function MaterialMenu({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="素材の操作メニュー"
        onClick={() => setOpen((o) => !o)}
        className="grid h-7 w-7 place-items-center rounded-full text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <circle cx="3" cy="7" r="1.2" fill="currentColor" />
          <circle cx="7" cy="7" r="1.2" fill="currentColor" />
          <circle cx="11" cy="7" r="1.2" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1.5 w-40 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg anim-fade-in">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
            className="block w-full px-3 py-2 text-left text-xs text-neutral-700 transition hover:bg-neutral-50"
          >
            編集
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="block w-full px-3 py-2 text-left text-xs text-red-700 transition hover:bg-red-50"
          >
            削除
          </button>
        </div>
      )}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-8 anim-fade-in">
      <div className="flex items-center justify-between">
        <div className="h-3 w-16 rounded anim-shimmer" />
        <div className="h-7 w-40 rounded-full anim-shimmer" />
      </div>
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full anim-shimmer" />
        <div className="h-4 w-32 rounded anim-shimmer" />
      </div>
      <div className="mx-auto aspect-video w-full max-w-3xl rounded-3xl anim-shimmer" />
      <div className="mx-auto h-10 w-full max-w-3xl rounded-full anim-shimmer" />
      <div className="flex gap-6 border-b border-neutral-200 pb-3">
        <div className="h-4 w-16 rounded anim-shimmer" />
        <div className="h-4 w-16 rounded anim-shimmer" />
      </div>
    </div>
  );
}

function AvatarMenu({
  onDelete,
  deleting,
}: {
  onDelete: () => void;
  deleting: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="このブレインの操作メニュー"
        onClick={() => setOpen((o) => !o)}
        className="grid h-8 w-8 place-items-center rounded-full border border-neutral-300 bg-white text-neutral-600 hover:border-neutral-900"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <circle cx="3" cy="7" r="1.2" fill="currentColor" />
          <circle cx="7" cy="7" r="1.2" fill="currentColor" />
          <circle cx="11" cy="7" r="1.2" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1.5 w-48 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            disabled={deleting}
            className="block w-full px-3 py-2 text-left text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {deleting ? 'ゴミ箱に移動中…' : 'ゴミ箱に移動'}
          </button>
        </div>
      )}
    </div>
  );
}
