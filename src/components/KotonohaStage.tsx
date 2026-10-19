'use client';

import { useEffect, useRef, useState } from 'react';
import type { StageState } from './StreamingStage';
import { useLingeringCaption } from './useLingeringCaption';
import { digitizeKanaNumbers } from '@/lib/kanaDigits';

/**
 * コトノハ — 「アヤは、学んだ言葉でできている」。
 *
 * キオスク(巨大ビジョン・店頭サイネージ)用の全画面演出。アバターを
 * 光るオーブではなく「学習した文字たちの銀河」として描く:
 *
 *   - 待機中: 学習素材から抽出した言葉が銀河のように旋回する。
 *     縦書きの問いかけがローテーションし、タッチで会話が始まる。
 *   - 聞いている時: 銀河の周囲に輪が現れ、来場者の声量で脈動する。
 *   - 考えている時: 旋回が加速し、銀河が絞り込まれる。
 *   - 話す時: 発話した文字が一粒ずつ中心から湧き、巨大字幕へ昇る。
 *
 * 仕上げ(finish)は「墨」(漆黒×和紙色の明朝)と「ドット」(8bit)の
 * 2種。配色だけでなく書体・角丸・LED格子まで含めて切り替える。
 */

export type KotonohaFinish = 'sumi' | 'dot';

type Finish = {
  bg: string;
  bgImage: string;
  ink: string;
  dim: string;
  /** canvas 用 RGB("r,g,b")。 */
  glyph: string;
  acc1: string;
  acc2: string;
  spk: string;
  lsn: string;
  thk: string;
  cta: string;
  /** ドット仕上げのみ: 擬似LED格子のオーバーレイ。 */
  grid: string | null;
  fontDisplay: string;
  /** ドット仕上げのみ: 粒の座標をこのピクセル格子にスナップ。 */
  pixelSnap: number;
  round: boolean;
};

const FINISHES: Record<KotonohaFinish, Finish> = {
  // 墨: 漆黒に和紙色の太明朝。差し色は藍と行灯の橙。LEDで最も映える。
  sumi: {
    bg: '#060608',
    bgImage: 'radial-gradient(120% 90% at 50% 0%, #101017, #060608 60%)',
    ink: '#f2ead8',
    dim: '#8e8a7c',
    glyph: '242,234,216',
    acc1: '96,142,196',
    acc2: '226,168,88',
    spk: '232,178,98',
    lsn: '120,168,220',
    thk: '150,130,210',
    cta: '#e2a858',
    grid: null,
    fontDisplay: "'Shippori Mincho B1', 'Hiragino Mincho ProN', serif",
    pixelSnap: 0,
    round: true,
  },
  // ドット: 8bit。文字粒もドット書体で格子にスナップする。
  dot: {
    bg: '#070c08',
    bgImage: 'none',
    ink: '#d8ffd8',
    dim: '#6f8f6f',
    glyph: '141,242,155',
    acc1: '41,173,255',
    acc2: '255,236,39',
    spk: '255,236,39',
    lsn: '41,173,255',
    thk: '255,119,168',
    cta: '#ffec27',
    grid:
      'repeating-linear-gradient(0deg, rgba(0,0,0,.45) 0 1px, transparent 1px 5px),' +
      'repeating-linear-gradient(90deg, rgba(0,0,0,.45) 0 1px, transparent 1px 5px)',
    fontDisplay: "'DotGothic16', monospace",
    pixelSnap: 3,
    round: false,
  },
};

/** 学習素材から語彙が取れなかった場合の汎用フォールバック。 */
const DEFAULT_WORDS = [
  '学', '問', '声', '知', '手', '作', '話', '言', '葉', '考',
  '答', '数', '図', '工', '仕', '組', '道', '具', '未', '来', 'AI',
];

const STATE_LABELS: Partial<Record<StageState['status'], string>> = {
  connecting: '接続シテイマス',
  reconnecting: '接続シナオシテイマス',
  connected: '聞イテイマス',
  listening: '聞イテイマス',
  thinking: '考エテイマス',
  searching: '資料ヲ調ベテイマス',
  speaking: '話シテイマス',
};

/** 長い字幕は末尾だけを追いかける(巨大ビジョンの可読性優先)。 */
function tail(s: string, n: number): string {
  return s.length > n ? `…${s.slice(-n)}` : s;
}

// 待機中の縦書き書体・8bit書体。Next のビルド環境からは Google Fonts に
// 届かないことがあるため、next/font ではなく実行時に読み込む
// (キオスク端末は常時オンライン前提)。
const FONT_CSS_URL =
  'https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@700;800&family=DotGothic16&display=swap';

type Particle = {
  ch: string;
  a: number; // 公転角
  r0: number; // 公転半径(短辺比)
  sp: number;
  size: number;
  tilt: number; // 縦に潰して銀河らしく
  tw: number; // またたき位相
  acc: 0 | 1 | 2;
};

type Burst = { ch: string; dx: number; t: number; life: number };

type KotonohaStageProps = {
  finish: KotonohaFinish;
  mode: 'attract' | 'conv';
  status: StageState['status'];
  /** マイク・AI音声の音量(毎フレーム変わるため ref 渡しで再描画を避ける)。 */
  levels: React.MutableRefObject<{ mic: number; agent: number }>;
  captionUser: string;
  captionAgent: string;
  /** 銀河の核になる一文字(アバター名から導出、URLで差し替え可)。 */
  coreChar: string;
  /** 銀河を泳ぐ語彙(学習素材から抽出)。少なすぎる時はフォールバック。 */
  words: string[];
  /** 待機中にローテーションする縦書きの問いかけ。 */
  questions: string[];
  brand: string;
  foot: string;
  error?: string | null;
  onStart: () => void;
  onEnd: () => void;
  /** リハーサル(デモ)用: 実音声なしで音量を擬似生成する。 */
  simulateLevels?: boolean;
};

export default function KotonohaStage({
  finish,
  mode,
  status,
  levels,
  captionUser,
  captionAgent,
  coreChar,
  words,
  questions,
  brand,
  foot,
  error,
  onStart,
  onEnd,
  simulateLevels,
}: KotonohaStageProps) {
  const T = FINISHES[finish];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const coreRef = useRef<HTMLSpanElement>(null);
  const burstsRef = useRef<Burst[]>([]);
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // 書体は実行時に読み込む(重複挿入はIDで防ぐ)。
  useEffect(() => {
    const id = 'kotonoha-fonts';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = FONT_CSS_URL;
    document.head.appendChild(link);
  }, []);

  // 発話字幕が伸びた分だけ、文字を中心から字幕へ飛ばす。
  const prevCaptionRef = useRef('');
  useEffect(() => {
    const prev = prevCaptionRef.current;
    prevCaptionRef.current = captionAgent;
    if (!captionAgent || !captionAgent.startsWith(prev)) return;
    // 一度に大量に届いた時は最後の数文字だけ(画面が砂嵐にならないように)。
    const added = [...captionAgent.slice(prev.length)].slice(-6);
    for (const ch of added) {
      if (!ch.trim()) continue;
      if (burstsRef.current.length > 40) break;
      burstsRef.current.push({
        ch,
        dx: Math.random() * 2 - 1,
        t: 0,
        life: 0.7 + Math.random() * 0.3,
      });
    }
  }, [captionAgent]);

  // ---- 銀河の描画ループ ----
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    let W = 0;
    let H = 0;
    const DPR = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      W = r.width;
      H = r.height;
      canvas.width = Math.max(1, Math.round(W * DPR));
      canvas.height = Math.max(1, Math.round(H * DPR));
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const list = words.length >= 8 ? words : DEFAULT_WORDS;
    const parts: Particle[] = [];
    for (let i = 0; i < 84; i++) {
      const ch = list[(Math.random() * list.length) | 0];
      parts.push({
        ch,
        a: rnd(0, Math.PI * 2),
        r0: rnd(0.16, 0.46),
        sp: rnd(0.04, 0.16) * (Math.random() < 0.5 ? 1 : -1),
        // 複数文字の言葉は少し小さく(長さで場所を取るため)。
        size: ch.length > 1 ? rnd(10, 14) : rnd(11, 22),
        tilt: rnd(0.5, 0.85),
        tw: rnd(0, Math.PI * 2),
        acc:
          Math.random() < 0.14 ? ((Math.random() < 0.5 ? 1 : 2) as 1 | 2) : 0,
      });
    }

    const fin = FINISHES[finish];
    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2;
      const cy = H * 0.46;
      const base = Math.min(W, H);
      // プレビュー(幅430px)からの拡大率。巨大ビジョンでも粒が米粒に
      // ならないよう、画面サイズに追従して太らせる。
      const scl = Math.max(1, base / 430);

      const st = statusRef.current;
      const speaking = st === 'speaking';
      const listening = st === 'listening' || st === 'connected';
      const thinking = st === 'thinking' || st === 'searching';

      // 音量: 実測(マイク/AI音声)か、リハーサル用の擬似波形。
      let level = 0;
      let mic = 0;
      if (simulateLevels) {
        level = speaking
          ? Math.abs(Math.sin(t * 5.1)) *
            (0.5 + 0.5 * Math.abs(Math.sin(t * 0.83)))
          : 0;
        mic = listening
          ? 0.25 +
            0.75 * Math.abs(Math.sin(t * 3.1)) * Math.abs(Math.sin(t * 0.61))
          : 0;
      } else {
        level = speaking ? Math.min(1, levels.current.agent) : 0;
        mic = listening ? Math.min(1, levels.current.mic) : 0;
      }

      // 核の一文字: 声に合わせて灯り、わずかに脈打つ。
      const core = coreRef.current;
      if (core) {
        core.style.textShadow = `0 0 ${Math.round(34 * scl)}px rgba(${fin.spk},${(
          0.25 +
          level * 0.7
        ).toFixed(3)})`;
        core.style.transform = `scale(${(1 + level * 0.06).toFixed(4)})`;
      }

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 聞く: 相手の声に耳を澄ます輪(声量で膨らむ)。
      if (listening) {
        ctx.beginPath();
        ctx.arc(cx, cy, base * (0.3 + mic * 0.06), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${fin.lsn},${(0.25 + mic * 0.45).toFixed(3)})`;
        ctx.lineWidth = 2 * scl;
        ctx.stroke();
      }

      // 銀河の粒。考え中は速く回って絞り込まれる。
      const spin = thinking ? 3.4 : 1;
      const swell = 1 + (speaking ? level * 0.22 : 0.02 * Math.sin(t * 0.9));
      const squeeze = thinking ? 0.72 : 1;
      for (const p of parts) {
        if (!reduce) p.a += p.sp * spin * 0.016;
        const rr = p.r0 * base * swell * squeeze;
        let x = cx + Math.cos(p.a) * rr;
        let y = cy + Math.sin(p.a) * rr * p.tilt;
        const twinkle = 0.45 + 0.55 * Math.abs(Math.sin(t * 0.8 + p.tw));
        const alpha = (speaking ? 0.35 + level * 0.6 : 0.6) * twinkle;
        // 奥(上)ほど薄く小さく=立体感。
        const depth = 0.75 + 0.25 * ((Math.sin(p.a) + 1) / 2);
        ctx.font = `${p.size * depth * scl}px ${fin.fontDisplay}`;
        const rgb =
          p.acc === 1 ? fin.acc1 : p.acc === 2 ? fin.acc2 : fin.glyph;
        ctx.fillStyle = `rgba(${rgb},${Math.min(0.9, alpha * depth).toFixed(3)})`;
        if (fin.pixelSnap > 0) {
          const g = fin.pixelSnap * scl;
          x = Math.round(x / g) * g;
          y = Math.round(y / g) * g;
        }
        ctx.fillText(p.ch, x, y);
      }

      // 発話バースト: 中心から字幕(下)へ立ち上がる文字。
      const bursts = burstsRef.current;
      for (let j = bursts.length - 1; j >= 0; j--) {
        const b = bursts[j];
        b.t += 0.016;
        const k = b.t / b.life;
        if (k >= 1) {
          bursts.splice(j, 1);
          continue;
        }
        const bx = cx + b.dx * k * base * 0.32;
        const by = cy + (H * 0.78 - cy) * (k * k);
        ctx.font = `${(16 + 14 * (1 - k)) * scl}px ${fin.fontDisplay}`;
        ctx.fillStyle = `rgba(${fin.spk},${(1 - k).toFixed(3)})`;
        ctx.fillText(b.ch, bx, by);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [finish, words, simulateLevels, levels]);

  // 待機中の縦書き問いかけのローテーション。
  const [qIndex, setQIndex] = useState(0);
  useEffect(() => {
    if (mode !== 'attract' || questions.length < 2) return;
    const id = setInterval(() => {
      setQIndex((i) => (i + 1) % questions.length);
    }, 3400);
    return () => clearInterval(id);
  }, [mode, questions.length]);

  const stateLabel = STATE_LABELS[status] ?? '';
  // 字幕の余韻: 言い終わっても2秒は残す(読み切れるように)。
  const heldUser = useLingeringCaption(captionUser);
  const heldAgent = useLingeringCaption(captionAgent);
  const stateColor =
    status === 'speaking'
      ? `rgb(${T.spk})`
      : status === 'thinking' || status === 'searching'
        ? `rgb(${T.thk})`
        : status === 'listening' || status === 'connected'
          ? `rgb(${T.lsn})`
          : T.dim;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        backgroundColor: T.bg,
        backgroundImage: T.bgImage,
        color: T.ink,
        fontFamily: "'Zen Kaku Gothic New', 'Hiragino Sans', sans-serif",
      }}
    >
      <style>{`
        @keyframes kotonoha-blink { 50% { opacity: 0; } }
        @keyframes kotonoha-pixblink { 50% { opacity: .25; } }
        @media (prefers-reduced-motion: reduce) {
          .kotonoha-anim { animation: none !important; }
        }
      `}</style>

      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        aria-hidden
      />

      {/* 核の一文字(声に合わせて灯る)。 */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      >
        <span
          ref={coreRef}
          style={{
            fontFamily: T.fontDisplay,
            fontWeight: 800,
            fontSize: 'clamp(72px, 26vmin, 400px)',
            lineHeight: 1,
          }}
        >
          {coreChar}
        </span>
      </div>

      {/* 上辺: ブランド / LIVE / 終了。待機中の全面タッチを妨げないよう
          テキストはクリックを透過し、終了ボタンだけ受ける。 */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4vmin 5vmin 0',
          pointerEvents: 'none',
        }}
      >
        <span
          style={{
            fontSize: 'clamp(11px, 2vmin, 28px)',
            fontWeight: 700,
            letterSpacing: '.3em',
            color: T.dim,
          }}
        >
          {brand}
        </span>
        {mode === 'conv' && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '1.2vmin',
            }}
          >
            <span
              style={{
                fontSize: 'clamp(10px, 1.8vmin, 24px)',
                fontWeight: 900,
                letterSpacing: '.1em',
                color: `rgb(${T.spk})`,
              }}
            >
              ● LIVE
            </span>
            <button
              type="button"
              onClick={onEnd}
              style={{
                font: 'inherit',
                fontSize: 'clamp(11px, 1.8vmin, 24px)',
                fontWeight: 700,
                color: T.dim,
                background: 'transparent',
                border: `1px solid ${T.dim}`,
                borderRadius: T.round ? 999 : 0,
                padding: '0.8vmin 2.4vmin',
                cursor: 'pointer',
                pointerEvents: 'auto',
              }}
            >
              会話を終わる
            </button>
          </span>
        )}
      </div>

      {/* 待機: 全面タッチで開始。縦書きの問いかけ+CTA。 */}
      {mode === 'attract' && (
        <button
          type="button"
          onClick={onStart}
          aria-label="タッチして会話を始める"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 3,
            background: 'transparent',
            border: 0,
            cursor: 'pointer',
            color: 'inherit',
            font: 'inherit',
            padding: 0,
          }}
        >
          <span
            aria-hidden
            style={{
              position: 'absolute',
              top: '14%',
              right: '7%',
              height: '56%',
              writingMode: 'vertical-rl',
              textOrientation: 'mixed',
              fontFamily: T.fontDisplay,
              fontWeight: 800,
              fontSize: 'clamp(20px, 6vmin, 72px)',
              letterSpacing: '.14em',
              lineHeight: 1.5,
              display: 'grid',
            }}
          >
            {questions.map((q, i) => (
              <span
                key={q}
                style={{
                  gridArea: '1 / 1',
                  opacity: i === qIndex ? 1 : 0,
                  transform: i === qIndex ? 'none' : 'translateX(10px)',
                  transition: 'opacity .6s, transform .6s',
                }}
              >
                {q}
              </span>
            ))}
          </span>

          <span
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: '6%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '2.4vmin',
            }}
          >
            <span
              className="kotonoha-anim"
              style={{
                border: `1.5px solid ${T.cta}`,
                color: T.cta,
                borderRadius: T.round ? 999 : 0,
                padding: '1.8vmin 5vmin',
                fontWeight: 900,
                fontSize: 'clamp(14px, 3vmin, 40px)',
                letterSpacing: '.14em',
                backgroundColor: T.bg,
                animation: T.round
                  ? undefined
                  : 'kotonoha-pixblink 1.1s steps(1) infinite',
              }}
            >
              タッチして、話しかけてください
            </span>
            <span
              style={{
                fontSize: 'clamp(10px, 1.6vmin, 22px)',
                color: T.dim,
                letterSpacing: '.18em',
                fontWeight: 700,
              }}
            >
              {foot}
            </span>
            {error && (
              <span
                style={{
                  fontSize: 'clamp(10px, 1.5vmin, 20px)',
                  color: `rgb(${T.acc2})`,
                  maxWidth: '80%',
                }}
              >
                {error}
              </span>
            )}
          </span>
        </button>
      )}

      {/* 会話: 状態ライン+両者の字幕(太明朝の巨大字幕)。 */}
      {mode === 'conv' && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 3,
            padding: '0 6vmin 5vmin',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.6vmin',
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 'clamp(11px, 2.2vmin, 30px)',
              fontWeight: 900,
              letterSpacing: '.3em',
              color: stateColor,
            }}
          >
            {stateLabel}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 'clamp(12px, 2.6vmin, 34px)',
              color: T.dim,
              minHeight: '1.6em',
              fontWeight: 700,
            }}
          >
            {tail(digitizeKanaNumbers(heldUser), 40)}
          </p>
          <p
            style={{
              margin: 0,
              fontFamily: T.fontDisplay,
              fontWeight: 800,
              fontSize: 'clamp(22px, 7vmin, 84px)',
              lineHeight: 1.5,
              minHeight: '3.1em',
              textWrap: 'balance',
            }}
          >
            {tail(digitizeKanaNumbers(heldAgent), 60)}
            {status === 'speaking' && (
              <span
                className="kotonoha-anim"
                style={{
                  display: 'inline-block',
                  width: '.06em',
                  height: '.95em',
                  backgroundColor: `rgb(${T.spk})`,
                  verticalAlign: '-0.08em',
                  marginLeft: '0.08em',
                  animation: 'kotonoha-blink 1s steps(1) infinite',
                }}
              />
            )}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 'clamp(10px, 1.6vmin, 22px)',
              color: T.dim,
              letterSpacing: '.18em',
              fontWeight: 700,
            }}
          >
            {foot}
          </p>
        </div>
      )}

      {/* ドット仕上げ: 擬似LED格子(最前面・操作は透過)。 */}
      {T.grid && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 5,
            pointerEvents: 'none',
            backgroundImage: T.grid,
            mixBlendMode: 'multiply',
          }}
        />
      )}
    </div>
  );
}
