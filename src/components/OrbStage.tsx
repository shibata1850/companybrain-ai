'use client';

import { useEffect, useRef, useState } from 'react';
import type { StageState } from './StreamingStage';

/**
 * オーブ — Apple 製品のアシスタントを思わせる、透明感のあるガラスの
 * 3D球体。キオスク(巨大ビジョン・サイネージ)用の全画面演出。
 *
 *   - 待機中: 球体がふよふよと浮かび、内側で淡い色の光がゆっくり巡る。
 *   - 聞いている時: 来場者の声量に合わせ、球面に青い波紋が広がる。
 *   - 考えている時: 内側の光が速く巡り、色が紫へ寄る。
 *   - 話す時: AIの声の振幅に合わせ、球面に暖色の波紋が次々と走る。
 *
 * 3D表現は WebGL を使わず、canvas のラジアルグラデーションの重ねがけ
 * (ガラスのフレネル反射・鏡面ハイライト・内側の光・接地影)で描く。
 * 24時間稼働するサイネージでも軽いことを優先した。
 */

type Ripple = {
  r: number; // 現在の半径(球半径比 0..1)
  speed: number;
  strength: number; // 発生時の音量(濃さに使う)
  warm: boolean; // true=話す(暖色) / false=聞く(青)
};

type Blob = {
  a: number; // 公転角
  dist: number; // 中心からの距離(球半径比)
  size: number; // 半径(球半径比)
  speed: number;
  color: [number, number, number];
};

const STATE_LABELS: Partial<Record<StageState['status'], string>> = {
  connecting: '接続しています',
  reconnecting: '接続し直しています',
  connected: '聞いています',
  listening: '聞いています',
  thinking: '考えています',
  searching: '資料を調べています',
  speaking: '話しています',
};

/** 長い字幕は末尾だけを追いかける(巨大ビジョンの可読性優先)。 */
function tail(s: string, n: number): string {
  return s.length > n ? `…${s.slice(-n)}` : s;
}

type OrbStageProps = {
  mode: 'attract' | 'conv';
  status: StageState['status'];
  /** マイク・AI音声の音量(毎フレーム変わるため ref 渡しで再描画を避ける)。 */
  levels: React.MutableRefObject<{ mic: number; agent: number }>;
  captionUser: string;
  captionAgent: string;
  /** 待機中にローテーションする問いかけ。 */
  questions: string[];
  brand: string;
  foot: string;
  error?: string | null;
  onStart: () => void;
  onEnd: () => void;
  /** リハーサル(デモ)用: 実音声なしで音量を擬似生成する。 */
  simulateLevels?: boolean;
};

export default function OrbStage({
  mode,
  status,
  levels,
  captionUser,
  captionAgent,
  questions,
  brand,
  foot,
  error,
  onStart,
  onEnd,
  simulateLevels,
}: OrbStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // ---- 球体の描画ループ ----
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

    // 内側を巡る光(iOSのアシスタントを思わせる淡い寒色〜桃色)。
    const blobs: Blob[] = [
      { a: rnd(0, 6.28), dist: 0.38, size: 0.52, speed: 0.22, color: [90, 200, 250] },
      { a: rnd(0, 6.28), dist: 0.46, size: 0.44, speed: -0.17, color: [175, 130, 235] },
      { a: rnd(0, 6.28), dist: 0.42, size: 0.4, speed: 0.13, color: [255, 120, 170] },
      { a: rnd(0, 6.28), dist: 0.3, size: 0.46, speed: -0.26, color: [120, 220, 232] },
    ];
    const ripples: Ripple[] = [];
    let lastRippleAt = 0;

    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, W, H);
      const base = Math.min(W, H);

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

      // ふよふよ: ゆっくり上下し、わずかに漂う。
      const bob = reduce ? 0 : Math.sin(t * 0.55) * base * 0.014;
      const sway = reduce ? 0 : Math.sin(t * 0.32) * base * 0.006;
      const cx = W / 2 + sway;
      const cy = H * 0.42 + bob;
      // 呼吸+声でわずかに膨らむ。
      const R =
        base * 0.24 * (1 + 0.012 * Math.sin(t * 0.9) + level * 0.045);

      // 接地影(浮いている感じ)。球が上がるほど薄く小さく。
      const bobK = (bob / (base * 0.014) + 1) / 2; // 0(上)..1(下)
      const shY = H * 0.42 + base * 0.33;
      const shR = R * (0.62 + 0.1 * bobK);
      const sh = ctx.createRadialGradient(cx, shY, 0, cx, shY, shR);
      sh.addColorStop(0, `rgba(40,55,80,${0.1 + 0.07 * bobK})`);
      sh.addColorStop(1, 'rgba(40,55,80,0)');
      ctx.fillStyle = sh;
      ctx.beginPath();
      ctx.ellipse(cx, shY, shR, shR * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();

      // ---- ガラス球(クリップ内に内側の光と波紋を描く) ----
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.clip();

      // 地: ほぼ透明。縁に向かって青白く(フレネル反射)。
      const baseG = ctx.createRadialGradient(
        cx - R * 0.3,
        cy - R * 0.35,
        R * 0.1,
        cx,
        cy,
        R,
      );
      baseG.addColorStop(0, 'rgba(255,255,255,0.55)');
      baseG.addColorStop(0.55, 'rgba(235,242,252,0.28)');
      baseG.addColorStop(0.88, 'rgba(188,206,236,0.5)');
      baseG.addColorStop(1, 'rgba(150,176,222,0.72)');
      ctx.fillStyle = baseG;
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

      // 内側を巡る光。考え中は速く、紫寄りに。
      const blobSpeed = thinking ? 3.2 : 1;
      ctx.globalCompositeOperation = 'lighter';
      for (const b of blobs) {
        if (!reduce) b.a += b.speed * blobSpeed * 0.016;
        const bx = cx + Math.cos(b.a) * R * b.dist;
        const by = cy + Math.sin(b.a * 0.9) * R * b.dist * 0.7;
        const br = R * b.size * (1 + level * 0.25);
        const [r0, g0, b0] = thinking ? [165, 120, 240] : b.color;
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        g.addColorStop(0, `rgba(${r0},${g0},${b0},${thinking ? 0.3 : 0.22})`);
        g.addColorStop(1, `rgba(${r0},${g0},${b0},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';

      // 波紋の発生: 聞く=相手の声 / 話す=AIの声。音が大きいほど頻繁に。
      const active = speaking ? level : listening ? mic : 0;
      const minGap = speaking ? 110 : 150;
      if (
        !reduce &&
        active > 0.08 &&
        now - lastRippleAt > minGap + (1 - active) * 220
      ) {
        lastRippleAt = now;
        ripples.push({
          r: 0.12,
          speed: 0.55 + active * 0.5,
          strength: active,
          warm: speaking,
        });
        if (ripples.length > 14) ripples.shift();
      }

      // 波紋: 球面を中心から縁へ広がる輪。縁に近づくほど
      // 楕円に潰して球の丸みに沿わせる。
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i];
        rp.r += rp.speed * 0.016;
        const k = rp.r; // 0..1
        if (k >= 1) {
          ripples.splice(i, 1);
          continue;
        }
        const alpha = (1 - k) * 0.55 * (0.35 + rp.strength * 0.65);
        const [cr, cg, cb] = rp.warm ? [255, 150, 130] : [95, 170, 250];
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alpha.toFixed(3)})`;
        ctx.lineWidth = 1.5 + (1 - k) * 2.5;
        ctx.beginPath();
        // 球面投影ふう: 半径は sin カーブで伸び、縦をわずかに潰す。
        const rr = R * Math.sin((k * Math.PI) / 2);
        ctx.ellipse(cx, cy, rr, rr * (1 - 0.18 * k), 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();

      // ---- ガラスの外観(クリップ外) ----
      // 鏡面ハイライト(左上の窓映り込み)。
      const hlx = cx - R * 0.38;
      const hly = cy - R * 0.48;
      const hl = ctx.createRadialGradient(hlx, hly, 0, hlx, hly, R * 0.45);
      hl.addColorStop(0, 'rgba(255,255,255,0.85)');
      hl.addColorStop(0.4, 'rgba(255,255,255,0.25)');
      hl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hl;
      ctx.beginPath();
      ctx.ellipse(
        hlx,
        hly,
        R * 0.34,
        R * 0.22,
        -0.5,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      // 下縁の照り返し。
      const bl = ctx.createRadialGradient(
        cx,
        cy + R * 0.72,
        0,
        cx,
        cy + R * 0.72,
        R * 0.5,
      );
      bl.addColorStop(0, 'rgba(255,255,255,0.35)');
      bl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = bl;
      ctx.beginPath();
      ctx.ellipse(cx, cy + R * 0.66, R * 0.42, R * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();

      // 縁の白いリム。
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = Math.max(1.2, R * 0.008);
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(140,165,210,0.35)';
      ctx.lineWidth = Math.max(1, R * 0.005);
      ctx.beginPath();
      ctx.arc(cx, cy, R + Math.max(1.5, R * 0.012), 0, Math.PI * 2);
      ctx.stroke();

      // 聞いている時: 球の外側にも、声量でふくらむ淡い輪をひとつ。
      if (listening) {
        ctx.strokeStyle = `rgba(95,170,250,${(0.12 + mic * 0.3).toFixed(3)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, R * (1.12 + mic * 0.08), 0, Math.PI * 2);
        ctx.stroke();
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [simulateLevels, levels]);

  // 待機中の問いかけのローテーション。
  const [qIndex, setQIndex] = useState(0);
  useEffect(() => {
    if (mode !== 'attract' || questions.length < 2) return;
    const id = setInterval(() => {
      setQIndex((i) => (i + 1) % questions.length);
    }, 3400);
    return () => clearInterval(id);
  }, [mode, questions.length]);

  const stateLabel = STATE_LABELS[status] ?? '';
  const stateColor =
    status === 'speaking'
      ? '#e06a50'
      : status === 'thinking' || status === 'searching'
        ? '#7d5fd3'
        : status === 'listening' || status === 'connected'
          ? '#3d7fd9'
          : '#8a94a6';

  const sysFont =
    "-apple-system, BlinkMacSystemFont, 'SF Pro JP', 'Hiragino Sans', 'Zen Kaku Gothic New', sans-serif";

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        background:
          'linear-gradient(180deg, #fbfcfe 0%, #f2f5fa 55%, #e8edf6 100%)',
        color: '#1c2430',
        fontFamily: sysFont,
      }}
    >
      <style>{`
        @keyframes orb-blink { 50% { opacity: 0; } }
        @media (prefers-reduced-motion: reduce) {
          .orb-anim { animation: none !important; }
        }
      `}</style>

      {/* 球の背後の淡い色のにじみ(画面全体の透明感)。 */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: '50%',
          top: '42%',
          width: '90vmin',
          height: '90vmin',
          transform: 'translate(-50%, -50%)',
          background:
            'radial-gradient(closest-side, rgba(150,190,250,0.18), rgba(215,170,240,0.1) 55%, rgba(255,255,255,0) 75%)',
          pointerEvents: 'none',
        }}
      />

      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        aria-hidden
      />

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
            letterSpacing: '.28em',
            color: '#9aa4b5',
          }}
        >
          {brand}
        </span>
        {mode === 'conv' && (
          <span
            style={{ display: 'inline-flex', alignItems: 'center', gap: '1.2vmin' }}
          >
            <span
              style={{
                fontSize: 'clamp(10px, 1.8vmin, 24px)',
                fontWeight: 800,
                letterSpacing: '.1em',
                color: '#e06a50',
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
                color: '#5a6578',
                background: 'rgba(255,255,255,0.65)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(90,101,120,0.25)',
                borderRadius: 999,
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

      {/* 待機: 全面タッチで開始。問いかけ+すりガラスのCTA。 */}
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
              aria-hidden
              style={{
                display: 'grid',
                minHeight: '1.8em',
                fontSize: 'clamp(16px, 3.6vmin, 46px)',
                fontWeight: 700,
                color: '#39455a',
                letterSpacing: '.04em',
              }}
            >
              {questions.map((q, i) => (
                <span
                  key={q}
                  style={{
                    gridArea: '1 / 1',
                    opacity: i === qIndex ? 1 : 0,
                    transform: i === qIndex ? 'none' : 'translateY(8px)',
                    transition: 'opacity .6s, transform .6s',
                  }}
                >
                  {q}
                </span>
              ))}
            </span>
            <span
              style={{
                border: '1px solid rgba(61,127,217,0.35)',
                color: '#2f6fc4',
                background: 'rgba(255,255,255,0.6)',
                backdropFilter: 'blur(12px)',
                borderRadius: 999,
                padding: '1.8vmin 5vmin',
                fontWeight: 800,
                fontSize: 'clamp(14px, 3vmin, 40px)',
                letterSpacing: '.1em',
                boxShadow: '0 8px 30px rgba(61,127,217,0.12)',
              }}
            >
              タッチして、話しかけてください
            </span>
            <span
              style={{
                fontSize: 'clamp(10px, 1.6vmin, 22px)',
                color: '#9aa4b5',
                letterSpacing: '.16em',
                fontWeight: 700,
              }}
            >
              {foot}
            </span>
            {error && (
              <span
                style={{
                  fontSize: 'clamp(10px, 1.5vmin, 20px)',
                  color: '#c0442e',
                  maxWidth: '80%',
                }}
              >
                {error}
              </span>
            )}
          </span>
        </button>
      )}

      {/* 会話: 状態ライン+両者の字幕。 */}
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
              fontWeight: 800,
              letterSpacing: '.24em',
              color: stateColor,
            }}
          >
            {stateLabel}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 'clamp(12px, 2.6vmin, 34px)',
              color: '#8a94a6',
              minHeight: '1.6em',
              fontWeight: 700,
            }}
          >
            {tail(captionUser, 40)}
          </p>
          <p
            style={{
              margin: 0,
              fontWeight: 700,
              fontSize: 'clamp(22px, 6.4vmin, 80px)',
              lineHeight: 1.5,
              minHeight: '3.1em',
              color: '#1c2430',
              textWrap: 'balance',
            }}
          >
            {tail(captionAgent, 60)}
            {status === 'speaking' && (
              <span
                className="orb-anim"
                style={{
                  display: 'inline-block',
                  width: '.06em',
                  height: '.95em',
                  backgroundColor: '#e06a50',
                  verticalAlign: '-0.08em',
                  marginLeft: '0.08em',
                  animation: 'orb-blink 1s steps(1) infinite',
                }}
              />
            )}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 'clamp(10px, 1.6vmin, 22px)',
              color: '#9aa4b5',
              letterSpacing: '.16em',
              fontWeight: 700,
            }}
          >
            {foot}
          </p>
        </div>
      )}
    </div>
  );
}
