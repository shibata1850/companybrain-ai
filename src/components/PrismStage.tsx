'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { StageState } from './StreamingStage';
import { useLingeringCaption } from './useLingeringCaption';
import { digitizeKanaNumbers } from '@/lib/kanaDigits';

/**
 * 収差オーブ — 揺れると色版がズレる、三次元のワイヤー球。
 * キオスク(巨大ビジョン・サイネージ)用の全画面演出。
 *
 * 球は経緯線で組んだ無彩色の「天球儀」。画面に色は塗らず、
 * R/G/B(闇)または C/M/Y(紙)の3版を空間ごとズラして重ね刷りした
 * ときのズレだけが色になる(印刷の版ズレ/レンズの色収差の文法。
 * 「光るコア」というAIの記号を使わないための設計)。
 *
 *   - ズレ量 = 動きの速さ + 声の強さ(静止時も1px弱の気配を残す)
 *   - 話し始めに球が「身じろぎ」して大きくズレ、減衰して戻る
 *   - 波紋は声に合わせて正面の極から発生し、球面を伝って裏側へ
 *     回り込む。発話字幕にも同じ版ズレ(text-shadow)がかかる
 *   - 考えている時は自転が速まる
 *
 * three.js はこの画面(キオスク)でだけ読み込まれる。
 */

export type PrismGround = 'dark' | 'paper';

type Ground = {
  clear: number;
  blend: THREE.Blending;
  /** 3版の色。闇=加法混色(RGB)、紙=減法混色(CMY)。 */
  ch: [number, number, number];
  bg: string;
  ink: string;
  dim: string;
  splitA: string;
  splitB: string;
  err: string;
};

const GROUNDS: Record<PrismGround, Ground> = {
  dark: {
    clear: 0x070709,
    blend: THREE.AdditiveBlending,
    ch: [0xff1e3c, 0x28ff78, 0x286eff],
    bg: '#070709',
    ink: '#f4f3ef',
    dim: '#74747c',
    splitA: 'rgba(255,20,70,.85)',
    splitB: 'rgba(0,130,255,.85)',
    err: '#ff6a7e',
  },
  paper: {
    clear: 0xf5f3ee,
    blend: THREE.MultiplyBlending,
    ch: [0x00aec7, 0xe6007e, 0xffcd00],
    bg: '#f5f3ee',
    ink: '#1a191d',
    dim: '#8e8c92',
    splitA: 'rgba(230,0,126,.65)',
    splitB: 'rgba(0,160,190,.65)',
    err: '#b63a2c',
  },
};

const STATE_LABELS: Partial<Record<StageState['status'], string>> = {
  connecting: 'つないでいます',
  reconnecting: 'つなぎなおしています',
  connected: 'きいています',
  listening: 'きいています',
  thinking: 'かんがえています',
  searching: 'しらべています',
  speaking: 'はなしています',
};

/** 長い字幕は末尾だけを追いかける(巨大ビジョンの可読性優先)。 */
function tail(s: string, n: number): string {
  return s.length > n ? `…${s.slice(-n)}` : s;
}

type Ripple = { k: number; sp: number; st: number };

type PrismStageProps = {
  ground: PrismGround;
  mode: 'attract' | 'conv';
  status: StageState['status'];
  /** マイク・AI音声の音量(毎フレーム変わるため ref 渡しで再描画を避ける)。 */
  levels: React.MutableRefObject<{ mic: number; agent: number }>;
  captionUser: string;
  captionAgent: string;
  questions: string[];
  brand: string;
  foot: string;
  error?: string | null;
  onStart: () => void;
  onEnd: () => void;
  /** リハーサル(デモ)用: 実音声なしで音量を擬似生成する。 */
  simulateLevels?: boolean;
};

export default function PrismStage({
  ground,
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
}: PrismStageProps) {
  const G = GROUNDS[ground];
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [glFailed, setGlFailed] = useState(false);
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  // 「身じろぎ」を外(状態遷移・問いの切替)から起こすためのフック。
  const kickRef = useRef<(power: number) => void>(() => {});

  // 話し始めの身じろぎ。
  const prevStatusRef = useRef(status);
  useEffect(() => {
    if (status === 'speaking' && prevStatusRef.current !== 'speaking') {
      kickRef.current(0.12);
    }
    prevStatusRef.current = status;
  }, [status]);

  // ---- three.js のセットアップと描画ループ ----
  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;
    const reduce = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch {
      setGlFailed(true);
      return;
    }
    setGlFailed(false);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const g = GROUNDS[ground];
    renderer.setClearColor(g.clear, 1);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 9 / 16, 0.1, 50);
    camera.position.set(0, 0, 4.4);

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
      camera.aspect = r.width / Math.max(1, r.height);
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // 単位円(全ワイヤーの共通ジオメトリ)。
    const SEG = 96;
    const RIPPLE_MAX = 14;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0));
    }
    const circleGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const materials: THREE.LineBasicMaterial[] = [];

    type Plate = {
      root: THREE.Group;
      spin: THREE.Group;
      rim: THREE.Line;
      ring2: THREE.Line;
      listenRing: THREE.Line;
      ripples: THREE.Line[];
      floor: THREE.Line;
    };

    function buildPlate(colorHex: number, blending: THREE.Blending): Plate {
      const mat = (op: number) => {
        const m = new THREE.LineBasicMaterial({
          color: colorHex,
          transparent: true,
          opacity: op,
          blending,
          depthTest: false,
          depthWrite: false,
        });
        materials.push(m);
        return m;
      };
      const plateRoot = new THREE.Group();

      // 回転する天球儀(経線9+緯線5)。
      const spin = new THREE.Group();
      for (let i = 0; i < 9; i++) {
        const line = new THREE.Line(circleGeo, mat(0.32));
        line.rotation.y = (i / 9) * Math.PI;
        line.rotation.x = Math.PI / 2;
        spin.add(line);
      }
      for (let i = 1; i <= 5; i++) {
        const ly = Math.cos((i / 6) * Math.PI);
        const lr = Math.sin((i / 6) * Math.PI);
        const line = new THREE.Line(circleGeo, mat(0.2));
        line.rotation.x = Math.PI / 2;
        line.position.y = ly;
        line.scale.setScalar(lr);
        spin.add(line);
      }
      plateRoot.add(spin);

      // 正面を向いたままの部品: 外周リム・内リング・聞く輪・波紋。
      const still = new THREE.Group();
      const rim = new THREE.Line(circleGeo, mat(0.95));
      still.add(rim);
      const ring2 = new THREE.Line(circleGeo, mat(0.14));
      still.add(ring2);
      const listenRing = new THREE.Line(circleGeo, mat(0));
      still.add(listenRing);
      const ripples: THREE.Line[] = [];
      for (let i = 0; i < RIPPLE_MAX; i++) {
        const rp = new THREE.Line(circleGeo, mat(0));
        rp.visible = false;
        still.add(rp);
        ripples.push(rp);
      }
      plateRoot.add(still);

      // 床のリング(接地の気配)。
      const floor = new THREE.Line(circleGeo, mat(0.14));
      floor.rotation.x = Math.PI / 2;
      plateRoot.add(floor);

      scene.add(plateRoot);
      return { root: plateRoot, spin, rim, ring2, listenRing, ripples, floor };
    }

    const plates: Plate[] = g.ch.map((c) => buildPlate(c, g.blend));

    // 物理: 身じろぎのばね・波紋・自転。
    const spring = { x: 0, y: 0, vx: 0, vy: 0 };
    const kick = (power: number) => {
      const a = Math.random() * Math.PI * 2;
      spring.vx += Math.cos(a) * power;
      spring.vy += Math.sin(a) * power * 0.6;
    };
    kickRef.current = kick;
    const rippleList: Ripple[] = [];
    let lastRippleAt = 0;
    let prevX: number | null = null;
    let prevY: number | null = null;
    let rotY = 0;
    let rotX = 0.35;

    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const t = (now - t0) / 1000;

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

      if (!reduce) {
        const k = 14;
        const damp = 4.2;
        const dt = 0.016;
        spring.vx += (-k * spring.x - damp * spring.vx) * dt;
        spring.vy += (-k * spring.y - damp * spring.vy) * dt;
        if (speaking && Math.random() < level * 0.12) kick(0.05 * level);
        spring.x += spring.vx * dt;
        spring.y += spring.vy * dt;
      }

      const bob = reduce ? 0 : Math.sin(t * 0.55) * 0.09;
      const sway = reduce ? 0 : Math.sin(t * 0.32) * 0.04;
      const cx = sway + spring.x;
      const cy = 0.12 + bob + spring.y;
      const R = 1 + 0.012 * Math.sin(t * 0.9) + level * 0.04;

      if (!reduce) {
        rotY += 0.016 * (thinking ? 0.9 : 0.18);
        rotX = 0.35 + Math.sin(t * 0.21) * 0.08 + spring.y * 0.6;
      }

      // 版ズレ量 = 動きの速さ + 声の強さ(+常時わずかな気配)。
      const velX = prevX === null ? 0 : cx - prevX;
      const velY = prevY === null ? 0 : cy - prevY;
      prevX = cx;
      prevY = cy;
      const speed = Math.hypot(velX, velY);
      const split = Math.min(
        0.004 + speed * 2.4 + level * 0.07 + mic * 0.018,
        0.16,
      );
      const ang =
        speed > 0.002 ? Math.atan2(velY, velX) : t * (thinking ? 1.6 : 0.35);
      const ox = Math.cos(ang) * split;
      const oy = Math.sin(ang) * split * 0.65;

      // 字幕側の版ズレ(CSS変数で共有)。
      root.style.setProperty(
        '--sx',
        `${Math.min(6, 1 + level * 5 + speed * 160).toFixed(2)}px`,
      );

      // 波紋: 正面の極(k=0)から裏の極(k=1)へ。
      const active = speaking ? level : listening ? mic : 0;
      const minGap = speaking ? 110 : 150;
      if (
        !reduce &&
        active > 0.08 &&
        now - lastRippleAt > minGap + (1 - active) * 220
      ) {
        lastRippleAt = now;
        rippleList.push({ k: 0.04, sp: 0.4 + active * 0.35, st: active });
        if (rippleList.length > RIPPLE_MAX) rippleList.shift();
      }
      for (let i = rippleList.length - 1; i >= 0; i--) {
        rippleList[i].k += rippleList[i].sp * 0.016;
        if (rippleList[i].k >= 1) rippleList.splice(i, 1);
      }

      // 3版へ同じ姿勢を適用(位置だけ ±ズレ)。
      const offs: Array<[number, number]> = [
        [ox, oy],
        [0, 0],
        [-ox, -oy],
      ];
      for (let p = 0; p < plates.length; p++) {
        const pl = plates[p];
        pl.root.position.set(cx + offs[p][0], cy + offs[p][1], 0);
        pl.spin.rotation.set(rotX, rotY, 0);
        pl.spin.scale.setScalar(R);
        pl.rim.scale.setScalar(R);
        pl.ring2.scale.setScalar(R * 0.72);
        pl.floor.position.y = -1.45;
        pl.floor.scale.set(R * 0.6, R * 0.6, R * 0.18);
        pl.listenRing.visible = listening;
        if (listening) {
          pl.listenRing.scale.setScalar(R * (1.1 + mic * 0.08));
          (pl.listenRing.material as THREE.LineBasicMaterial).opacity =
            0.14 + mic * 0.3;
        }
        for (let j = 0; j < RIPPLE_MAX; j++) {
          const node = pl.ripples[j];
          const rp = rippleList[j];
          if (!rp) {
            node.visible = false;
            continue;
          }
          const th = rp.k * Math.PI;
          node.visible = true;
          node.scale.setScalar(Math.max(0.001, R * Math.sin(th)));
          node.position.z = R * Math.cos(th);
          (node.material as THREE.LineBasicMaterial).opacity =
            (1 - rp.k) * 0.7 * (0.35 + rp.st * 0.65);
        }
      }

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      kickRef.current = () => {};
      for (const m of materials) m.dispose();
      circleGeo.dispose();
      renderer.dispose();
    };
  }, [ground, simulateLevels, levels]);

  // 待機中の問いかけのローテーション(切替時に身じろぎ)。
  const [qIndex, setQIndex] = useState(0);
  useEffect(() => {
    if (mode !== 'attract' || questions.length < 2) return;
    const id = setInterval(() => {
      setQIndex((i) => (i + 1) % questions.length);
      kickRef.current(0.07);
    }, 3400);
    return () => clearInterval(id);
  }, [mode, questions.length]);

  const stateLabel = STATE_LABELS[status] ?? '';
  // 字幕の余韻: 言い終わっても2秒は残す(読み切れるように)。
  const heldUser = useLingeringCaption(captionUser);
  const heldAgent = useLingeringCaption(captionAgent);
  const sysFont =
    "'Zen Kaku Gothic New', 'Hiragino Sans', -apple-system, sans-serif";

  return (
    <div
      ref={rootRef}
      style={
        {
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          backgroundColor: G.bg,
          color: G.ink,
          fontFamily: sysFont,
          '--sx': '1px',
          '--splitA': G.splitA,
          '--splitB': G.splitB,
        } as React.CSSProperties
      }
    >
      <style>{`
        .prism-split {
          text-shadow:
            var(--sx, 1px) 0 var(--splitA),
            calc(-1 * var(--sx, 1px)) 0 var(--splitB);
        }
        @keyframes prism-spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          .prism-spin { animation: none !important; }
        }
      `}</style>

      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
        aria-hidden
      />
      {glFailed && (
        <p
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            margin: 0,
            padding: '0 10%',
            textAlign: 'center',
            fontSize: 'clamp(12px, 2vmin, 24px)',
            color: G.dim,
          }}
        >
          この端末では WebGL を利用できないため、演出を表示できません。
        </p>
      )}

      {/* 上辺: ブランド / 終了。待機中の全面タッチを妨げないよう
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
            fontWeight: 900,
            letterSpacing: '.34em',
            color: G.dim,
          }}
        >
          {brand}
        </span>
        {mode === 'conv' && (
          <button
            type="button"
            onClick={onEnd}
            style={{
              font: 'inherit',
              fontSize: 'clamp(11px, 1.8vmin, 24px)',
              fontWeight: 700,
              letterSpacing: '.1em',
              color: G.dim,
              background: 'transparent',
              border: `1px solid ${G.dim}`,
              borderRadius: 0,
              padding: '0.8vmin 2.4vmin',
              cursor: 'pointer',
              pointerEvents: 'auto',
            }}
          >
            会話を終わる
          </button>
        )}
      </div>

      {/* 待機: 全面タッチで開始。ポスター組みの問い+角枠のCTA。 */}
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
            textAlign: 'left',
          }}
        >
          <span
            className="prism-split"
            aria-hidden
            style={{
              position: 'absolute',
              left: '7%',
              right: '7%',
              top: '10%',
              display: 'grid',
              fontWeight: 900,
              lineHeight: 1.32,
              letterSpacing: '.02em',
              fontSize: 'clamp(26px, 8vmin, 96px)',
            }}
          >
            {questions.map((q, i) => (
              <span
                key={q}
                style={{
                  gridArea: '1 / 1',
                  opacity: i === qIndex ? 1 : 0,
                  transition: 'opacity .5s',
                }}
              >
                {q}
              </span>
            ))}
          </span>

          <span
            style={{
              position: 'absolute',
              left: '7%',
              right: '7%',
              bottom: '6%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: '2.2vmin',
            }}
          >
            <span
              className="prism-split"
              style={{
                border: `1px solid ${G.ink}`,
                color: G.ink,
                padding: '1.6vmin 3.6vmin',
                fontWeight: 900,
                fontSize: 'clamp(13px, 2.8vmin, 38px)',
                letterSpacing: '.22em',
              }}
            >
              ふれて、話しかけてください
            </span>
            <span
              style={{
                fontSize: 'clamp(10px, 1.6vmin, 22px)',
                color: G.dim,
                letterSpacing: '.26em',
                fontWeight: 700,
              }}
            >
              {foot}
            </span>
            {error && (
              <span
                style={{
                  fontSize: 'clamp(10px, 1.5vmin, 20px)',
                  color: G.err,
                  maxWidth: '90%',
                }}
              >
                {error}
              </span>
            )}
          </span>
        </button>
      )}

      {/* 接続中・繋ぎなおし中: マイクがまだ使えないことが分かるよう、
          画面中央にローディングを出す。 */}
      {(status === 'connecting' || status === 'reconnecting') && (
        <div
          role="status"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 3,
            display: 'grid',
            placeItems: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '2.4vmin',
            }}
          >
            <span
              className="prism-spin"
              aria-hidden
              style={{
                width: '9vmin',
                height: '9vmin',
                borderRadius: '50%',
                border: `2px solid ${G.dim}`,
                borderTopColor: G.ink,
                animation: 'prism-spin 0.9s linear infinite',
              }}
            />
            <span
              style={{
                fontSize: 'clamp(13px, 2.4vmin, 32px)',
                fontWeight: 900,
                letterSpacing: '.3em',
                color: G.ink,
              }}
            >
              {STATE_LABELS[status]}
            </span>
          </div>
        </div>
      )}

      {/* 会話: 状態ライン+両者の字幕(左寄せのポスター組み)。 */}
      {mode === 'conv' && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 3,
            padding: '0 7vmin 5vmin',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.4vmin',
            textAlign: 'left',
            pointerEvents: 'none',
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 'clamp(11px, 2vmin, 28px)',
              fontWeight: 900,
              letterSpacing: '.44em',
              color: G.dim,
              minHeight: '1.3em',
            }}
          >
            {stateLabel}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 'clamp(12px, 2.4vmin, 32px)',
              color: G.dim,
              minHeight: '1.5em',
              fontWeight: 700,
            }}
          >
            {tail(digitizeKanaNumbers(heldUser), 40)}
          </p>
          {/* アヤの発言。読みやすさ優先で、この文字には版ズレを
              かけない(ズレ演出は球と待機画面の文字のみ)。 */}
          <p
            style={{
              margin: 0,
              fontWeight: 900,
              lineHeight: 1.45,
              letterSpacing: '.01em',
              fontSize: 'clamp(21px, 6vmin, 76px)',
              minHeight: '3em',
              textWrap: 'balance',
            }}
          >
            {tail(digitizeKanaNumbers(heldAgent), 60)}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 'clamp(10px, 1.6vmin, 22px)',
              color: G.dim,
              letterSpacing: '.26em',
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
