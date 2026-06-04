'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import StreamingAvatar, {
  AvatarQuality,
  StreamingEvents,
  TaskMode,
  TaskType,
} from '@heygen/streaming-avatar';

type Status =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'speaking'
  | 'ended'
  | 'error';

export default function StreamingStage({
  coverUrl,
  avatarName,
  onAvatarReady,
  onStatusChange,
}: {
  coverUrl: string | null;
  avatarName: string;
  /**
   * Called once the avatar is connected. The parent gets a `speak`
   * function it can hand a string to. Returns a Promise that resolves
   * when the avatar finishes speaking.
   */
  onAvatarReady: (speak: (text: string) => Promise<void>) => void;
  onStatusChange?: (status: Status) => void;
}) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const avatarRef = useRef<StreamingAvatar | null>(null);

  const setS = useCallback(
    (s: Status) => {
      setStatus(s);
      onStatusChange?.(s);
    },
    [onStatusChange],
  );

  const stop = useCallback(async () => {
    try {
      await avatarRef.current?.stopAvatar();
    } catch {
      // ignore
    }
    avatarRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setS('ended');
  }, [setS]);

  useEffect(() => {
    return () => {
      // Make sure we drop the streaming connection on unmount so credits
      // don't keep ticking after navigation.
      void stop();
    };
  }, [stop]);

  async function start() {
    setError(null);
    setS('connecting');
    try {
      const res = await fetch('/api/streaming/token', { method: 'POST' });
      const json = (await res.json()) as {
        token?: string;
        avatarId?: string;
        language?: string;
        error?: string;
      };
      if (!res.ok || !json.token) {
        throw new Error(json.error || `token failed: HTTP ${res.status}`);
      }

      const avatar = new StreamingAvatar({ token: json.token });
      avatarRef.current = avatar;

      avatar.on(StreamingEvents.STREAM_READY, (event) => {
        const stream = (event as unknown as { detail: MediaStream }).detail;
        if (videoRef.current && stream) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {});
        }
        setS('connected');
      });
      avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
        setS('ended');
      });
      avatar.on(StreamingEvents.AVATAR_START_TALKING, () => {
        setS('speaking');
      });
      avatar.on(StreamingEvents.AVATAR_STOP_TALKING, () => {
        setS('connected');
      });

      await avatar.createStartAvatar({
        avatarName: json.avatarId || 'Wayne_20240711',
        quality: AvatarQuality.Low,
        language: json.language || 'ja',
      });

      const speak = async (text: string) => {
        if (!avatarRef.current) return;
        await avatarRef.current.speak({
          text,
          taskType: TaskType.REPEAT,
          taskMode: TaskMode.SYNC,
        });
      };
      onAvatarReady(speak);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      setS('error');
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-3">
      <div className="relative aspect-video w-full overflow-hidden rounded-3xl border border-neutral-200 bg-black">
        {status === 'idle' || status === 'ended' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-neutral-100 text-center">
            {coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverUrl}
                alt={avatarName}
                className="h-24 w-24 rounded-full object-cover ring-2 ring-white shadow-lg"
              />
            )}
            <div>
              <p className="text-sm font-medium text-neutral-900">
                {avatarName} と会話する
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                セッションを開始するとリアルタイムで応答します
              </p>
            </div>
            <button
              type="button"
              onClick={start}
              className="rounded-full bg-neutral-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
            >
              セッションを開始
            </button>
          </div>
        ) : null}

        {status === 'connecting' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-900 text-white">
            <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-white" />
            <p className="text-sm">接続中...</p>
          </div>
        ) : null}

        <video
          ref={videoRef}
          playsInline
          autoPlay
          className={`h-full w-full ${
            status === 'connected' || status === 'speaking' ? 'block' : 'hidden'
          }`}
        />

        {status === 'connected' || status === 'speaking' ? (
          <div className="absolute right-3 top-3 flex items-center gap-2 rounded-full bg-black/50 px-3 py-1 text-[11px] text-white backdrop-blur">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                status === 'speaking'
                  ? 'animate-pulse bg-emerald-400'
                  : 'bg-emerald-400'
              }`}
            />
            {status === 'speaking' ? '話しています…' : 'スタンバイ'}
          </div>
        ) : null}

        {status === 'connected' || status === 'speaking' ? (
          <button
            type="button"
            onClick={stop}
            className="absolute bottom-3 right-3 rounded-full bg-white/90 px-3 py-1 text-[11px] font-medium text-neutral-700 backdrop-blur transition hover:bg-white"
          >
            セッション終了
          </button>
        ) : null}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
