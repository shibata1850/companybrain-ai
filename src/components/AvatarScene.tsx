'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { digitizeKanaNumbers } from '@/lib/kanaDigits';

/**
 * 全画面アバターシーン(共通部品)。
 *
 * 通話中の「顔」。スマホ/PCの通話とキオスクの両方で使い、受け答えの
 * 状態に合わせてアバターが動く:
 *
 *   - 話している間: 実際の声の振幅(agentLevel)で脈動し、声の波紋が
 *     外へ広がる。無音の瞬間は静止する=「本当に話している」感
 *   - 聞いている間: 相手(ユーザー)の声の大きさ(micLevel)で
 *     聞き取りリングが反応する=「ちゃんと聞こえている」感
 *   - 考えている/資料を確認している間: アバターの周りをドットが周回
 *   - 待機: ゆっくりとした呼吸(スケールの微振動)
 *
 * 写真1枚でも成立する設計(口パクはキャラクター画像のスプライトが
 * 用意でき次第、agentLevel 駆動でここに追加する)。
 * prefers-reduced-motion では装飾アニメーションを止める。
 */

export type AvatarSceneStatus =
  | 'connecting'
  | 'reconnecting'
  | 'connected'
  | 'listening'
  | 'thinking'
  | 'searching'
  | 'speaking';

export default function AvatarScene({
  coverUrl,
  name,
  status,
  agentLevel,
  micLevel,
  captionAgent,
  captionUser,
  elapsedLabel,
  note,
  onEnd,
}: {
  coverUrl: string | null;
  name: string;
  status: AvatarSceneStatus;
  /** AIの発話音量 0..1(スピーカーに出ている音の実測)。 */
  agentLevel: number;
  /** ユーザーのマイク音量 0..1。 */
  micLevel: number;
  captionAgent: string;
  captionUser: string;
  elapsedLabel: string;
  /** 画面下部の常設注記(AI再現の明示)。 */
  note?: string;
  onEnd: () => void;
}) {
  // ページ遷移アニメ(transform を持つ祖先)の中では fixed がビューポート
  // 基準にならず、シーンが潰れて見えなくなる。body 直下へポータルで
  // 描画して、常に全画面を確保する。
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const speaking = status === 'speaking';
  const listening = status === 'listening' || status === 'connected';
  const busyThinking = status === 'thinking' || status === 'searching';
  const connecting = status === 'connecting' || status === 'reconnecting';

  const statusText =
    status === 'speaking'
      ? '話しています'
      : status === 'listening'
        ? 'そのまま話しかけてください'
        : status === 'thinking'
          ? '考えています…'
          : status === 'searching'
            ? '資料を確認しています…'
            : status === 'connecting'
              ? '接続中…'
              : '再接続中…';

  // 演出の強さ。話中はAIの声、聞き取り中は相手の声に追従する。
  const lvl = speaking ? agentLevel : listening ? micLevel : 0;

  if (!mounted) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex flex-col overflow-hidden"
      // 背面が絶対に透けないよう、グラデーションとは独立に白のベタ塗りを
      // インラインで敷く(クラス未生成・読み込み遅延でも不透過を保証)。
      style={{ backgroundColor: '#ffffff' }}
    >
      {/* 状態別の背景色はクロスフェードする不透過レイヤーで重ねる。 */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 bg-gradient-to-b from-emerald-50 via-white to-emerald-100 transition-opacity duration-700 ${
          speaking ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 bg-gradient-to-b from-indigo-50 via-white to-indigo-100 transition-opacity duration-700 ${
          busyThinking ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 bg-gradient-to-b from-neutral-50 via-white to-neutral-100 transition-opacity duration-700 ${
          !speaking && !busyThinking ? 'opacity-100' : 'opacity-0'
        }`}
      />
      {/* 上部: 名前・状態・経過時間 */}
      <div className="relative flex shrink-0 items-start justify-between px-6 pt-[calc(1.25rem+env(safe-area-inset-top))]">
        <div>
          <p className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            {name}
          </p>
          <p className="mt-1 flex items-center gap-2 text-sm text-neutral-500">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                speaking
                  ? 'bg-emerald-500'
                  : listening
                    ? 'bg-emerald-400'
                    : busyThinking
                      ? 'animate-pulse bg-indigo-400'
                      : 'animate-pulse bg-amber-400'
              }`}
            />
            {statusText}
          </p>
        </div>
        <span className="rounded-full bg-neutral-900/5 px-3 py-1 font-mono text-sm tabular-nums text-neutral-500">
          {elapsedLabel}
        </span>
      </div>

      {/* 中央: アバター本体と演出 */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {/* 声の波紋(話している間、声量に応じて放射)。 */}
        {speaking && (
          <>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="pointer-events-none absolute h-56 w-56 rounded-full border-2 border-emerald-400/60 motion-safe:animate-[cb-ripple_2.1s_ease-out_infinite] motion-reduce:hidden sm:h-72 sm:w-72"
                style={{
                  animationDelay: `${i * 0.7}s`,
                  opacity: 0.2 + lvl * 0.8,
                }}
              />
            ))}
          </>
        )}

        {/* 聞き取りリング(相手の声に反応)。 */}
        {listening && (
          <span
            className="pointer-events-none absolute rounded-full border-4 border-sky-300/70 transition-all duration-100"
            style={{
              width: `calc(15rem + ${lvl * 90}px)`,
              height: `calc(15rem + ${lvl * 90}px)`,
              opacity: 0.25 + lvl * 0.6,
            }}
          />
        )}

        {/* 接続中・再接続中: マイクがまだ使えないことが分かるよう、
            アバターの周りに回転リング+中央下にラベルを出す。 */}
        {connecting && (
          <>
            <span
              aria-hidden
              className="pointer-events-none absolute h-60 w-60 rounded-full border-4 border-neutral-300 border-t-neutral-800 motion-safe:animate-spin sm:h-72 sm:w-72"
            />
            <p
              role="status"
              className="pointer-events-none absolute rounded-full bg-neutral-900/80 px-4 py-1.5 text-sm font-bold text-white"
              style={{ transform: 'translateY(10.5rem)' }}
            >
              {status === 'connecting'
                ? '接続しています…'
                : 'つなぎなおしています…'}
            </p>
          </>
        )}

        {/* 思考中の周回ドット。 */}
        {busyThinking && (
          <span className="pointer-events-none absolute h-64 w-64 motion-safe:animate-[cb-orbit_2.4s_linear_infinite] sm:h-80 sm:w-80">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 rounded-full bg-indigo-400"
                style={{
                  transform: `rotate(${i * 120}deg) translateY(2px)`,
                  transformOrigin: '50% 8rem',
                  opacity: 0.8 - i * 0.25,
                }}
              />
            ))}
          </span>
        )}

        {/* アバター。話すと声の振幅で脈動し、わずかに弾む。 */}
        <div
          className={`relative h-52 w-52 overflow-hidden rounded-full bg-neutral-200 shadow-2xl ring-8 ring-white sm:h-64 sm:w-64 ${
            connecting ? 'motion-safe:animate-pulse' : ''
          } ${!speaking && !connecting ? 'motion-safe:animate-[cb-breathe_4.5s_ease-in-out_infinite]' : ''}`}
          style={{
            transform: speaking
              ? `scale(${1 + lvl * 0.07}) translateY(${-lvl * 6}px)`
              : undefined,
            transition: 'transform 90ms ease-out',
            boxShadow: speaking
              ? `0 25px 50px -12px rgba(0,0,0,0.25), 0 0 ${24 + lvl * 70}px rgba(16,185,129,${0.3 + lvl * 0.5})`
              : undefined,
          }}
        >
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center text-6xl font-bold text-neutral-400">
              {name.slice(0, 1)}
            </span>
          )}
        </div>
      </div>

      {/* 下部: 字幕 → 操作 → 注記 */}
      <div className="relative flex shrink-0 flex-col items-center gap-4 px-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <div
          className="flex min-h-[7.5rem] w-full max-w-2xl flex-col items-center justify-end gap-2 text-center"
          aria-live="polite"
        >
          {captionUser && (
            <p className="max-w-full text-sm leading-relaxed text-neutral-400">
              {tail(digitizeKanaNumbers(captionUser), 48)}
            </p>
          )}
          {captionAgent && (
            <p className="max-w-full rounded-3xl bg-neutral-900/90 px-6 py-3 text-base font-medium leading-relaxed text-white shadow-lg sm:text-lg">
              {tail(digitizeKanaNumbers(captionAgent), 90)}
            </p>
          )}
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={onEnd}
            aria-label="会話を終了する"
            className="grid h-16 w-16 place-items-center rounded-full bg-red-600 text-white shadow-lg transition active:scale-95"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <span className="text-xs font-bold text-red-600">終了</span>
        </div>

        {note && (
          <p className="max-w-sm text-center text-[10px] leading-relaxed text-neutral-400">
            {note}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** 字幕は発話の末尾を追いかける。 */
function tail(s: string, n: number): string {
  return s.length > n ? `…${s.slice(-n)}` : s;
}
