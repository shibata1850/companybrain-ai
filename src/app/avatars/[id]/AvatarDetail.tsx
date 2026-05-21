'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

export default function AvatarDetail({ id }: { id: string }) {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [trainFile, setTrainFile] = useState<File | null>(null);
  const [training, setTraining] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/avatars/${id}`);
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

  // Poll any non-terminal generations until they finish.
  const pendingIds = useMemo(() => {
    if (!data) return [] as string[];
    return data.generations
      .filter((g) => g.status !== 'ready' && g.status !== 'error')
      .map((g) => g.id);
  }, [data]);

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (pendingIds.length === 0) return;
    pollTimer.current = setInterval(async () => {
      for (const gid of pendingIds) {
        try {
          await fetch(`/api/generations/${gid}`);
        } catch {
          // ignore
        }
      }
      await load();
    }, 5000);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [pendingIds, load]);

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

  if (error) {
    return (
      <div className="rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm">
        エラー: {error}
      </div>
    );
  }
  if (!data) {
    return <div className="text-white/60">読み込み中…</div>;
  }
  const { avatar, training_videos, generations } = data;

  return (
    <div className="space-y-8">
      <header className="flex items-center gap-4">
        <div className="h-20 w-20 overflow-hidden rounded-full border border-white/10 bg-black/40">
          {avatar.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar.cover_url}
              alt={avatar.name}
              className="h-full w-full object-cover"
            />
          ) : null}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{avatar.name}</h1>
          {avatar.description && (
            <p className="text-sm text-white/60">{avatar.description}</p>
          )}
        </div>
      </header>

      <section className="rounded-lg border border-white/10 bg-white/5 p-5">
        <h2 className="text-lg font-semibold">質問する</h2>
        <p className="mt-1 text-sm text-white/60">
          学習済みの知識から、{avatar.name} 本人として答える動画を生成します。
        </p>
        <form onSubmit={ask} className="mt-3 space-y-3">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            placeholder="例：新人にまず教えるべきことは何ですか？"
            className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={asking || !question.trim()}
            className="rounded-md bg-indigo-500 px-4 py-2 text-sm font-medium hover:bg-indigo-400 disabled:opacity-50"
          >
            {asking ? '回答生成中…' : '回答動画を作る'}
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold">これまでの回答</h2>
        {generations.length === 0 && (
          <p className="mt-2 text-sm text-white/50">まだ質問がありません。</p>
        )}
        <ul className="mt-3 space-y-4">
          {generations.map((g) => (
            <li
              key={g.id}
              className="rounded-lg border border-white/10 bg-white/5 p-4"
            >
              <div className="text-sm text-white/50">
                {new Date(g.created_at).toLocaleString('ja-JP')}
              </div>
              <div className="mt-1 font-medium">Q. {g.question}</div>
              {g.answer && (
                <div className="mt-2 whitespace-pre-wrap text-sm text-white/80">
                  A. {g.answer}
                </div>
              )}
              <div className="mt-3">
                {g.status === 'ready' && g.video_url ? (
                  <video
                    controls
                    src={g.video_url}
                    poster={g.thumbnail_url ?? undefined}
                    className="w-full max-w-md rounded-md border border-white/10"
                  />
                ) : g.status === 'error' ? (
                  <div className="text-sm text-red-300">
                    エラー: {g.error_message || '不明なエラー'}
                  </div>
                ) : (
                  <div className="text-sm text-white/50">
                    ステータス: {g.status} … 数十秒〜数分で動画が生成されます
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-white/10 bg-white/5 p-5">
        <h2 className="text-lg font-semibold">追加で学習させる</h2>
        <p className="mt-1 text-sm text-white/60">
          {avatar.name} が話している動画を追加するほど、回答内容が
          本人らしくなります（顔と声は最初の動画から確定）。
        </p>
        <form onSubmit={addTrainingVideo} className="mt-3 space-y-3">
          <input
            type="file"
            accept="video/*"
            onChange={(e) => setTrainFile(e.target.files?.[0] ?? null)}
            className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-indigo-500 file:px-3 file:py-1 file:text-white"
          />
          <button
            type="submit"
            disabled={!trainFile || training}
            className="rounded-md bg-indigo-500 px-4 py-2 text-sm font-medium hover:bg-indigo-400 disabled:opacity-50"
          >
            {training ? '学習中…' : 'この動画から学習させる'}
          </button>
        </form>

        <h3 className="mt-6 text-sm font-medium text-white/80">
          学習済み動画 ({training_videos.length})
        </h3>
        <ul className="mt-2 space-y-2 text-sm">
          {training_videos.map((v) => (
            <li
              key={v.id}
              className="rounded-md border border-white/10 bg-black/30 p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-white/80">{v.file_name ?? v.id}</span>
                <span className="text-xs text-white/50">{v.status}</span>
              </div>
              {v.summary && (
                <p className="mt-1 text-xs text-white/60">{v.summary}</p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
