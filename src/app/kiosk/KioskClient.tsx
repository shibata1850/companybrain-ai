'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import StreamingStage, {
  type StreamingStageHandle,
  type TranscriptMessage,
} from '@/components/StreamingStage';

/**
 * キオスク(公開ディスプレイ)画面。LEDビジョン・店頭サイネージ用。
 *
 * - URL の ?k=<アクセスキー> とサーバー環境変数の照合だけで動く
 *   (ログイン画面を出さない。会話できるのは環境変数で固定された
 *   1ブレインのみ)
 * - 待機ループ(立ち絵+呼びかけ)→ タッチで会話開始 → 無音が続くと
 *   自動終了して待機へ戻る、の無人運転
 * - 会話は actor「kiosk」として監査ログへ記録する。現地に
 *   「会話は記録されます」の掲示を併用すること
 */

const AUTO_END_SILENCE_MS = 45_000;

type KioskAvatar = {
  id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
};

function newSessionId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `k_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function KioskClient() {
  const params = useSearchParams();
  const kioskKey = params.get('k') || '';

  const [avatar, setAvatar] = useState<KioskAvatar | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const stageRef = useRef<StreamingStageHandle>(null);
  const sessionIdRef = useRef<string>(newSessionId());

  // 表示するブレインの情報(名前・アイコン)を取得。
  useEffect(() => {
    if (!kioskKey) return;
    let cancelled = false;
    fetch(`/api/kiosk/info?k=${encodeURIComponent(kioskKey)}`)
      .then(async (r) => {
        const json = (await r.json()) as {
          avatar?: KioskAvatar;
          error?: string;
        };
        if (cancelled) return;
        if (!r.ok || !json.avatar) {
          setLoadError(json.error || `HTTP ${r.status}`);
        } else {
          setAvatar(json.avatar);
        }
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [kioskKey]);

  // 会話の監査記録(確定メッセージごとに送る)。
  const handleMessage = useCallback(
    (m: TranscriptMessage) => {
      void fetch('/api/kiosk/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: kioskKey,
          entries: [
            {
              role: m.role,
              content: m.text,
              session_id: sessionIdRef.current,
            },
          ],
        }),
        keepalive: true,
      }).catch(() => {});
    },
    [kioskKey],
  );

  const handleLiveChange = useCallback((isLive: boolean) => {
    if (isLive) sessionIdRef.current = newSessionId();
    setLive(isLive);
  }, []);

  // 設定・キー不備の案内(スタッフ向け)。
  if (!kioskKey || loadError) {
    return (
      <div className="fixed inset-0 z-[100] grid place-items-center bg-neutral-50 p-8 text-center">
        <div>
          <p className="text-lg font-bold text-neutral-800">
            キオスクを表示できません
          </p>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-neutral-500">
            {!kioskKey
              ? 'URL にアクセスキーが付いていません。管理者が発行したブックマーク(/kiosk?k=…)から開いてください。'
              : `設定を確認してください: ${loadError}`}
          </p>
        </div>
      </div>
    );
  }

  if (!avatar) {
    return (
      <div className="fixed inset-0 z-[100] grid place-items-center bg-neutral-50">
        <p className="text-sm text-neutral-400">準備しています…</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-gradient-to-b from-white via-neutral-50 to-emerald-50">
      {/* 会話ステージ。中身はスマホ/PCと同じ共通部品を、展示向けに拡大。
          zoom は Chrome/Edge(展示端末想定)でレイアウトごと拡大される。 */}
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="w-full max-w-xl" style={{ zoom: 1.5 }}>
          <StreamingStage
            ref={stageRef}
            avatarId={avatar.id}
            coverUrl={avatar.cover_url}
            avatarName={avatar.name}
            onMessage={handleMessage}
            kioskKey={kioskKey}
            onLiveChange={handleLiveChange}
            autoEndAfterSilenceMs={AUTO_END_SILENCE_MS}
          />
        </div>
      </div>

      {/* 待機ループ。タッチで会話開始。live になると自動で消える。 */}
      {!live && (
        <button
          type="button"
          onClick={() => stageRef.current?.start()}
          aria-label={`${avatar.name} と話す`}
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-8 bg-gradient-to-b from-white via-neutral-50 to-emerald-50 text-center"
        >
          <div className="h-56 w-56 overflow-hidden rounded-full bg-neutral-200 shadow-xl ring-8 ring-white">
            {avatar.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatar.cover_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>
          <div>
            <p className="text-5xl font-bold tracking-tight text-neutral-900">
              {avatar.name}
            </p>
            {avatar.description && (
              <p className="mx-auto mt-3 max-w-xl text-lg text-neutral-500">
                {avatar.description}
              </p>
            )}
          </div>
          <span className="animate-pulse rounded-full bg-neutral-900 px-12 py-5 text-2xl font-bold text-white shadow-lg">
            画面にタッチして話しかけてください
          </span>
          <span className="text-sm text-neutral-400">
            会話は品質向上のため記録されます
          </span>
        </button>
      )}
    </div>
  );
}
