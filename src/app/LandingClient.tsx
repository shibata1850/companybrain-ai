'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PLANS, type Plan } from '@/lib/plans';

export default function LandingClient() {
  return (
    <div className="lp-bleed -mt-6 -mb-6 sm:-mt-8 sm:-mb-8">
      <Hero />
      <LogosStrip />
      <GachaSection />
      <PlaygroundDemo />
      <Features />
      <HowItWorks />
      <UseCases />
      <BeforeAfter />
      <Pricing />
      <FaqSection />
      <FinalCta />
      <Footer />
    </div>
  );
}

/* ===================================================================
   HERO — animated gradient blobs + cursor-tracking glow + tagline
   =================================================================== */

function Hero() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState({ x: 50, y: 50 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    function onMove(e: MouseEvent) {
      const r = el!.getBoundingClientRect();
      setCursor({
        x: ((e.clientX - r.left) / r.width) * 100,
        y: ((e.clientY - r.top) / r.height) * 100,
      });
    }
    el.addEventListener('mousemove', onMove);
    return () => el.removeEventListener('mousemove', onMove);
  }, []);

  return (
    <section
      ref={wrapRef}
      className="relative isolate overflow-hidden bg-neutral-950 text-white"
    >
      {/* gradient blobs */}
      <div
        aria-hidden
        className="lp-blob absolute -left-32 -top-32 h-[520px] w-[520px] rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 opacity-50 blur-3xl"
      />
      <div
        aria-hidden
        className="lp-blob-slow absolute -right-32 top-40 h-[480px] w-[480px] rounded-full bg-gradient-to-br from-pink-500 to-orange-400 opacity-40 blur-3xl"
      />
      <div
        aria-hidden
        className="lp-blob absolute bottom-0 left-1/3 h-[400px] w-[400px] rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 opacity-30 blur-3xl"
        style={{ animationDelay: '4s' }}
      />
      {/* cursor-tracking glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-[background] duration-300"
        style={{
          background: `radial-gradient(600px circle at ${cursor.x}% ${cursor.y}%, rgba(255,255,255,0.08), transparent 40%)`,
        }}
      />

      <div className="mx-auto grid max-w-7xl gap-10 px-6 pb-24 pt-24 sm:pt-32 md:grid-cols-2 md:gap-14 md:pb-32">
        <div className="relative z-10">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-medium tracking-wide backdrop-blur">
            <span className="grid h-1.5 w-1.5 place-items-center rounded-full bg-emerald-400" />
            Made for Japan — Gemini Live 搭載
          </span>
          <h1 className="mt-5 text-4xl font-bold leading-[1.15] tracking-tight sm:text-5xl md:text-6xl">
            社員の<span className="lp-gradient-text">知識と話し方</span>を、
            <br className="hidden sm:block" />
            AI が引き継ぐ。
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-neutral-300 sm:text-lg">
            CompanyBrain は、社内の資料・マニュアル・議事録を学習させ、
            指定した人物の口調でリアルタイム音声会話できる
            次世代の社内ナレッジ AI です。
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium text-neutral-900 transition hover:scale-[1.02] hover:bg-neutral-100"
            >
              無料ではじめる
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <path
                  d="M3 8h10M9 4l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  className="transition group-hover:translate-x-0.5"
                />
              </svg>
            </Link>
            <a
              href="#demo"
              className="inline-flex items-center gap-2 rounded-full border border-white/30 px-6 py-3 text-sm font-medium text-white transition hover:bg-white/10"
            >
              ▶ 30 秒デモを見る
            </a>
          </div>
          <p className="mt-3 text-[11px] text-neutral-400">
            クレジットカード不要・1 分で開始
          </p>

          <dl className="mt-12 grid max-w-md grid-cols-3 gap-6">
            <Stat n="<3 秒" label="質問への応答" />
            <Stat n="40 ヵ国" label="多言語対応" />
            <Stat n="99.9%" label="稼働実績" />
          </dl>
        </div>

        <div className="relative z-10 flex items-center justify-center">
          <FloatingBrain />
        </div>
      </div>
    </section>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div>
      <dt className="text-xl font-bold tracking-tight">{n}</dt>
      <dd className="text-[11px] text-neutral-400">{label}</dd>
    </div>
  );
}

/**
 * Hero centerpiece: pulsing gradient orb with orbiting "thought" chips
 * that spin around it. Pure CSS keyframes, no JS animation loop.
 */
function FloatingBrain() {
  const thoughts = [
    { t: '経費精算ルールは?', x: 0, y: -120 },
    { t: '営業先の議事録要約', x: 110, y: -50 },
    { t: '人事規程の確認', x: 110, y: 70 },
    { t: '法令検索', x: 0, y: 130 },
    { t: '製品 FAQ', x: -110, y: 70 },
    { t: '社内マニュアル', x: -110, y: -50 },
  ];
  return (
    <div className="relative h-[340px] w-[340px] sm:h-[400px] sm:w-[400px]">
      {/* outer pulse rings */}
      <div className="lp-pulse-ring absolute inset-0 rounded-full bg-indigo-500/30" />
      <div
        className="lp-pulse-ring absolute inset-0 rounded-full bg-pink-500/20"
        style={{ animationDelay: '1.3s' }}
      />

      {/* spinning orbit dotted ring */}
      <div className="lp-spin-slow absolute inset-8 rounded-full border border-dashed border-white/20" />

      {/* central gradient orb */}
      <div className="absolute inset-12 grid place-items-center rounded-full lp-gradient shadow-[0_0_120px_rgba(139,92,246,0.5)]">
        <div className="lp-float text-6xl sm:text-7xl">🧠</div>
      </div>

      {/* thought chips that float */}
      <div className="absolute inset-0">
        {thoughts.map((th, i) => (
          <span
            key={th.t}
            className="lp-float absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-medium text-white backdrop-blur"
            style={{
              transform: `translate(calc(-50% + ${th.x}px), calc(-50% + ${th.y}px))`,
              animationDelay: `${i * 0.4}s`,
            }}
          >
            {th.t}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ===================================================================
   LOGOS — placeholder strip "信頼する企業" (replaceable later)
   =================================================================== */

function LogosStrip() {
  const items = [
    'SOFTDOING',
    '建設テック',
    '士業ネット',
    '製造ナビ',
    '医療事務協会',
    '物流連合',
    '小売 DX',
  ];
  return (
    <section className="border-y border-neutral-200 bg-neutral-50 py-8">
      <p className="text-center text-[11px] uppercase tracking-[0.2em] text-neutral-400">
        Trusted by teams building with AI
      </p>
      <div className="relative mt-4 overflow-hidden">
        <div className="lp-marquee flex w-max gap-12 whitespace-nowrap px-6">
          {[...items, ...items].map((it, i) => (
            <span
              key={i}
              className="text-sm font-semibold tracking-tight text-neutral-400"
            >
              {it}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ===================================================================
   PLAYGROUND DEMO — game-like "talk to a brain" mini-app
   Users pick a persona, click sample questions, and watch
   a typed answer appear. No real API call — entirely client-side
   so it's instant and free.
   =================================================================== */

type DemoPersona = {
  id: string;
  name: string;
  emoji: string;
  bio: string;
  qa: { q: string; a: string }[];
  bg: string;
};

const DEMO_PERSONAS: DemoPersona[] = [
  {
    id: 'accounting',
    name: '経理ヘルプデスク',
    emoji: '💼',
    bio: '経理部の規程に詳しい仮想アシスタント',
    bg: 'from-indigo-500 to-violet-600',
    qa: [
      {
        q: '出張交通費の上限はいくら?',
        a: '国内出張の交通費は実費精算が基本です。新幹線は普通車指定席まで、航空機はエコノミークラス、宿泊費は 1 泊 12,000 円(東京・大阪は 15,000 円)が上限となります。領収書は必ず添付してください。',
      },
      {
        q: '接待費の勘定科目は?',
        a: '接待費は基本的に「交際費」勘定で処理します。ただし社内の慰労会など、社外の人物が含まれない場合は「福利厚生費」になります。1 人 5,000 円以下の会議費は「会議費」として交際費から除外できます。',
      },
      {
        q: '海外出張のレート換算は?',
        a: '原則として帰国日翌営業日の TTM レート(三菱 UFJ 銀行)を使用します。クレジットカード払いの場合は明細記載の換算レートを優先します。為替差損益は別途処理します。',
      },
    ],
  },
  {
    id: 'sales',
    name: '営業 トップセールス',
    emoji: '🚀',
    bio: '営業部長の口調と知識を学んだブレイン',
    bg: 'from-pink-500 to-orange-500',
    qa: [
      {
        q: '初回アポでまず聞くべきことは?',
        a: '「いま一番困ってる業務は何ですか?」これに尽きる。商品説明から入る営業は二流だ。相手の課題を 5 分聞き出せたら、その後の 30 分は全部刺さる時間になる。質問 7 割、説明 3 割で行こう。',
      },
      {
        q: '値引き要請にはどう対応?',
        a: '値引きには必ず「条件交換」をぶつける。「年間契約なら 10% お引きします」「他部署もご紹介いただければ…」みたいにね。ゼロ条件の値引きは絶対やらない。相場が崩れる。',
      },
      {
        q: 'クロージングのコツは?',
        a: '迷ってる相手に「決めてください」は禁句。代わりに「導入するならいつから始めたいですか?」と聞く。日付を答え始めた瞬間、心の中ではもう決まってる。',
      },
    ],
  },
  {
    id: 'engineer',
    name: 'シニアエンジニア',
    emoji: '⚡',
    bio: '社内コード規約・設計判断のレビュアー',
    bg: 'from-emerald-500 to-cyan-500',
    qa: [
      {
        q: 'PR レビューで一番見るポイントは?',
        a: '読んで意図が伝わるかどうか。動くコードは前提で、3 ヶ月後の自分が見て困らないかを意識してる。命名 > テスト > 構造、の順で見ることが多い。',
      },
      {
        q: 'マイクロサービスはいつ採用すべき?',
        a: '組織のサイズが先で、技術判断は後。チームが 3 つ以上独立して動き始めたら検討。それまではモジュラーモノリスで十分。早すぎる分割で死ぬプロジェクトを何度も見てきた。',
      },
      {
        q: 'テストはどこまで書く?',
        a: '境界とビジネスロジックは必須。UI スナップショットや getter のテストは不要。コアの変更で落ちないテストは資産じゃなく負債だよ。',
      },
    ],
  },
];

function PlaygroundDemo() {
  const [personaId, setPersonaId] = useState(DEMO_PERSONAS[0].id);
  const persona = useMemo(
    () => DEMO_PERSONAS.find((p) => p.id === personaId)!,
    [personaId],
  );

  const [activeQ, setActiveQ] = useState<number | null>(null);
  const [typed, setTyped] = useState('');
  const [thinking, setThinking] = useState(false);

  // Reset typed answer when persona changes
  useEffect(() => {
    setActiveQ(null);
    setTyped('');
  }, [personaId]);

  // Typewriter effect for the answer.
  useEffect(() => {
    if (activeQ === null) return;
    const fullAnswer = persona.qa[activeQ].a;
    setThinking(true);
    setTyped('');
    let cancelled = false;
    const thinkTimer = setTimeout(() => {
      if (cancelled) return;
      setThinking(false);
      let i = 0;
      const tick = () => {
        if (cancelled) return;
        i += 1;
        setTyped(fullAnswer.slice(0, i));
        if (i < fullAnswer.length) {
          // varied speed for natural feel
          const delay = /[、。!?]/.test(fullAnswer[i - 1] ?? '') ? 80 : 22;
          window.setTimeout(tick, delay);
        }
      };
      tick();
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(thinkTimer);
    };
  }, [activeQ, persona]);

  return (
    <section
      id="demo"
      className="relative isolate overflow-hidden bg-neutral-50 py-24 sm:py-28"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-12 max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1 text-[11px] font-medium text-indigo-700">
            🎮 触って遊べる
          </span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            まずは、好きなブレインに
            <br />
            話しかけてみよう。
          </h2>
          <p className="mt-3 text-neutral-600">
            実際の CompanyBrain では、人物の動画・社内資料を学習させて
            完全オリジナルのブレインを作れます。下のサンプルで雰囲気をどうぞ。
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* Persona picker */}
          <div className="space-y-2">
            {DEMO_PERSONAS.map((p) => {
              const active = p.id === personaId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPersonaId(p.id)}
                  className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border p-3 text-left transition ${
                    active
                      ? 'border-neutral-900 bg-white shadow-md'
                      : 'border-neutral-200 bg-white/60 hover:border-neutral-400 hover:bg-white'
                  }`}
                >
                  <span
                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-xl text-white ${p.bg}`}
                  >
                    {p.emoji}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-neutral-900">
                      {p.name}
                    </span>
                    <span className="block truncate text-[11px] text-neutral-500">
                      {p.bio}
                    </span>
                  </span>
                  {active && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400">
                      ●
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Chat window */}
          <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
            {/* mock header bar */}
            <div className="flex items-center gap-2 border-b border-neutral-100 bg-neutral-50/80 px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <span className="ml-3 text-[11px] text-neutral-400">
                {persona.name} · CompanyBrain
              </span>
            </div>

            <div className="flex h-[440px] flex-col">
              {/* messages */}
              <div className="flex-1 space-y-4 overflow-y-auto p-5">
                <div className="flex items-start gap-2">
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br text-sm text-white ${persona.bg}`}
                  >
                    {persona.emoji}
                  </span>
                  <div className="max-w-[80%] rounded-2xl rounded-tl-md bg-neutral-100 px-3.5 py-2 text-sm text-neutral-800">
                    こんにちは。{persona.bio}です。
                    下のサンプル質問から選んでみてください。
                  </div>
                </div>

                {activeQ !== null && (
                  <>
                    <div className="flex justify-end">
                      <div className="max-w-[80%] rounded-2xl rounded-tr-md bg-neutral-900 px-3.5 py-2 text-sm text-white">
                        {persona.qa[activeQ].q}
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br text-sm text-white ${persona.bg}`}
                      >
                        {persona.emoji}
                      </span>
                      <div className="max-w-[80%] rounded-2xl rounded-tl-md bg-neutral-100 px-3.5 py-2 text-sm text-neutral-800">
                        {thinking ? (
                          <span className="flex gap-1">
                            <Dot delay={0} />
                            <Dot delay={150} />
                            <Dot delay={300} />
                          </span>
                        ) : (
                          <span className={typed.length < persona.qa[activeQ].a.length ? 'lp-caret' : ''}>
                            {typed}
                          </span>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* quick question buttons */}
              <div className="border-t border-neutral-100 bg-neutral-50/60 p-3">
                <p className="mb-2 px-1 text-[10px] uppercase tracking-wider text-neutral-400">
                  サンプル質問
                </p>
                <div className="flex flex-wrap gap-2">
                  {persona.qa.map((qa, i) => (
                    <button
                      key={qa.q}
                      type="button"
                      onClick={() => setActiveQ(i)}
                      className={`rounded-full border px-3 py-1.5 text-xs transition ${
                        activeQ === i
                          ? 'border-neutral-900 bg-neutral-900 text-white'
                          : 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-900'
                      }`}
                    >
                      {qa.q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full bg-neutral-400"
      style={{
        animation: 'lp-typewriter-blink 1.2s steps(1) infinite',
        animationDelay: `${delay}ms`,
      }}
    />
  );
}

/* ===================================================================
   FEATURES — 6 cards in a grid
   =================================================================== */

function Features() {
  const items = [
    {
      icon: '🎥',
      title: '動画から人格を学習',
      body: '対象人物の動画をアップロードするだけ。表情・話し方・口癖まで取り込みます。',
    },
    {
      icon: '🎙️',
      title: 'リアルタイム音声会話',
      body: 'Gemini Live で 1〜3 秒の超低遅延応答。会議の壁打ち相手として使えます。',
    },
    {
      icon: '📚',
      title: '社内資料を一括学習',
      body: 'PDF・議事録・規程・URL をまとめて投入。pgvector で意味検索します。',
    },
    {
      icon: '🛡️',
      title: '完全プライベート',
      body: 'ブレインは作成者本人だけが利用可能。他のユーザーには見えません。',
    },
    {
      icon: '📋',
      title: '監査ログ完備',
      body: '質問・回答・素材投入まで全履歴を保存。コンプライアンス要件に対応。',
    },
    {
      icon: '🔌',
      title: 'Make / Webhook 連携',
      body: 'Notion / Slack / Google Drive と連携して自動でブレインに学習させられます。',
    },
  ];
  return (
    <section id="features" className="bg-white py-24 sm:py-28">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-3 py-1 text-[11px] font-medium text-white">
            FEATURES
          </span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            人を「複製」できる時代の、
            <br className="hidden sm:block" />
            社内ナレッジ AI。
          </h2>
        </div>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((f, i) => (
            <div
              key={f.title}
              className="group relative overflow-hidden rounded-2xl border border-neutral-200 bg-gradient-to-br from-white to-neutral-50 p-6 transition hover:-translate-y-0.5 hover:border-neutral-900 hover:shadow-lg"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="text-4xl">{f.icon}</div>
              <h3 className="mt-4 text-base font-semibold tracking-tight">
                {f.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                {f.body}
              </p>
              <div
                aria-hidden
                className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gradient-to-br from-indigo-200 to-pink-200 opacity-0 blur-2xl transition group-hover:opacity-60"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ===================================================================
   HOW IT WORKS — interactive 3-step
   =================================================================== */

function HowItWorks() {
  const steps = [
    {
      n: 1,
      title: 'ブレインを作る',
      body: '名前を決めて、人物の動画と社内資料をアップロード。素材はあとから追加もできます。',
      visual: '🧠',
    },
    {
      n: 2,
      title: '質問する',
      body: 'チャットで聞いてもよし、🎙 ボタンで音声会話してもよし。複数言語対応。',
      visual: '💬',
    },
    {
      n: 3,
      title: 'チームに渡す',
      body: '完成したブレインは「依頼ワークフロー」で同僚に譲渡。組織知が個人を越えて残る。',
      visual: '🚀',
    },
  ];
  const [active, setActive] = useState(0);

  return (
    <section className="bg-neutral-950 py-24 text-white sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-white">
            HOW IT WORKS
          </span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            3 ステップで、組織の脳を構築。
          </h2>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => {
            const isActive = i === active;
            return (
              <button
                key={s.n}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => setActive(i)}
                className={`group relative overflow-hidden rounded-2xl border p-6 text-left transition ${
                  isActive
                    ? 'border-white/80 bg-white/10 shadow-xl'
                    : 'border-white/15 bg-white/5 hover:border-white/40'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`grid h-8 w-8 place-items-center rounded-full text-xs font-bold ${
                      isActive
                        ? 'bg-white text-neutral-900'
                        : 'bg-white/20 text-white'
                    }`}
                  >
                    {s.n}
                  </span>
                  <span className="text-base font-semibold">{s.title}</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-neutral-300">
                  {s.body}
                </p>
                <div
                  className={`mt-6 text-5xl transition ${
                    isActive ? 'lp-float' : 'opacity-60'
                  }`}
                >
                  {s.visual}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ===================================================================
   PRICING — 4 cards: Free / Starter / Standard / Pro
   =================================================================== */

function Pricing() {
  return (
    <section id="pricing" className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-medium text-emerald-700">
            料金プラン
          </span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            まずは無料で。
            <br />
            成長に合わせて選べる 4 プラン。
          </h2>
          <p className="mt-3 text-sm text-neutral-600">
            年契約で 2 ヶ月分無料 · いつでもアップグレード / 解約可能 · 税抜
          </p>
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-4">
          {PLANS.map((p) => (
            <PlanCard key={p.id} plan={p} />
          ))}
        </div>

        <p className="mt-10 text-center text-xs text-neutral-500">
          ※ Gemini Live (音声) は弊社で API 料金を負担しているため、各プランの上限内で課金されません。
          上限を超えた場合は自動でテキスト回答に切り替わります。
        </p>
      </div>
    </section>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  const isFree = plan.priceJpy === 0;
  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-6 transition hover:-translate-y-0.5 hover:shadow-xl ${
        plan.highlighted
          ? 'border-neutral-900 bg-neutral-900 text-white shadow-lg'
          : 'border-neutral-200 bg-white'
      }`}
    >
      {plan.highlighted && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-500 to-pink-500 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white shadow">
          人気
        </span>
      )}
      <p
        className={`text-xs font-medium ${
          plan.highlighted ? 'text-neutral-300' : 'text-neutral-500'
        }`}
      >
        {plan.bestFor}
      </p>
      <h3 className="mt-1 text-xl font-bold tracking-tight">{plan.name}</h3>
      <p
        className={`mt-1 text-xs ${
          plan.highlighted ? 'text-neutral-300' : 'text-neutral-500'
        }`}
      >
        {plan.tagline}
      </p>

      <div className="mt-5">
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold tracking-tight">
            ¥{plan.priceJpy.toLocaleString('ja-JP')}
          </span>
          <span
            className={`text-sm ${
              plan.highlighted ? 'text-neutral-300' : 'text-neutral-500'
            }`}
          >
            / 月
          </span>
        </div>
        <p
          className={`mt-1 text-[11px] ${
            plan.highlighted ? 'text-neutral-300' : 'text-neutral-500'
          }`}
        >
          {plan.priceNote}
        </p>
      </div>

      <Link
        href="/login"
        className={`mt-5 inline-flex items-center justify-center rounded-full px-4 py-2.5 text-sm font-medium transition ${
          plan.highlighted
            ? 'bg-white text-neutral-900 hover:bg-neutral-100'
            : isFree
            ? 'border border-neutral-300 bg-white text-neutral-900 hover:border-neutral-900'
            : 'bg-neutral-900 text-white hover:bg-neutral-700'
        }`}
      >
        {plan.ctaLabel}
      </Link>

      <ul className="mt-6 space-y-2.5 text-sm">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              aria-hidden
              className={`mt-0.5 shrink-0 ${
                plan.highlighted ? 'text-emerald-300' : 'text-emerald-600'
              }`}
            >
              <path
                d="M3 8.5l3 3L13 5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
            <span
              className={
                plan.highlighted ? 'text-neutral-100' : 'text-neutral-700'
              }
            >
              {f}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ===================================================================
   FAQ
   =================================================================== */

function FaqSection() {
  const faqs = [
    {
      q: 'プラン変更や解約はいつでも可能ですか?',
      a: 'はい。マイページからいつでもアップグレード・ダウングレード・解約できます。日割り計算で清算します。',
    },
    {
      q: 'AI モデルの違いは?',
      a: 'Flash は高速・低コスト、Pro は精度重視、2.5 Pro は最高精度です。上位プランではより正確で文脈理解の深い回答が得られます。',
    },
    {
      q: 'データは AI の学習に使われますか?',
      a: 'いいえ。投入された資料・質問・回答は外部の学習データには使用されません。すべてあなたの環境に閉じています。',
    },
    {
      q: '音声会話の上限を超えたらどうなりますか?',
      a: '上限を超えた時点で自動的にテキスト回答モードに切り替わります。追加課金は発生しません。',
    },
    {
      q: '個人事業主でも使えますか?',
      a: 'もちろんです。フリー / スタータープランが特に個人 〜 小規模事業者向けに作られています。',
    },
  ];
  return (
    <section className="bg-neutral-50 py-24 sm:py-28">
      <div className="mx-auto max-w-3xl px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
          よくあるご質問
        </h2>
        <dl className="mt-10 space-y-3">
          {faqs.map((f) => (
            <details
              key={f.q}
              className="group rounded-2xl border border-neutral-200 bg-white p-5 transition hover:border-neutral-400"
            >
              <summary className="flex cursor-pointer items-center justify-between text-sm font-medium text-neutral-900">
                {f.q}
                <span className="text-xl text-neutral-400 transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-neutral-600">
                {f.a}
              </p>
            </details>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ===================================================================
   FINAL CTA
   =================================================================== */

function FinalCta() {
  return (
    <section className="relative isolate overflow-hidden bg-neutral-950 py-24 text-white sm:py-32">
      <div
        aria-hidden
        className="lp-blob absolute -left-32 top-0 h-[420px] w-[420px] rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 opacity-40 blur-3xl"
      />
      <div
        aria-hidden
        className="lp-blob-slow absolute -right-32 bottom-0 h-[420px] w-[420px] rounded-full bg-gradient-to-br from-pink-500 to-orange-400 opacity-40 blur-3xl"
      />
      <div className="relative mx-auto max-w-3xl px-6 text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
          あなたの会社にも、
          <br />
          <span className="lp-gradient-text">「もう一人の自分」</span>を。
        </h2>
        <p className="mt-5 text-base leading-relaxed text-neutral-300">
          フリープランで今すぐ試せます。クレジットカード不要、1 分で始められます。
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium text-neutral-900 transition hover:scale-[1.02] hover:bg-neutral-100"
          >
            無料ではじめる
          </Link>
          <a
            href="#pricing"
            className="inline-flex items-center gap-2 rounded-full border border-white/30 px-6 py-3 text-sm font-medium transition hover:bg-white/10"
          >
            料金を見る
          </a>
        </div>
      </div>
    </section>
  );
}

/* ===================================================================
   GACHA — slot-machine style "ブレインガチャ" mini-game
   Three reels (人格 × 業務 × 口調) spin and stop one after another.
   Lands on a random combo + shows a generated greeting for that brain.
   =================================================================== */

const GACHA_PERSONAS = [
  '営業マン',
  '経理スタッフ',
  'エンジニア',
  'デザイナー',
  'マーケター',
  '法務担当',
  'CS スタッフ',
  '人事',
];
const GACHA_THEMES = [
  '見積もり提案',
  '議事録要約',
  '社内規程',
  'バグ修正の相談',
  'クライアント説明',
  '採用面接',
  '問い合わせ対応',
  '社内 FAQ',
];
const GACHA_TONES = [
  '丁寧',
  'フランク',
  '関西弁',
  '体育会系',
  'ロジカル',
  'クリエイティブ',
  '慎重派',
  '熱血',
];

const TONE_GREETING: Record<string, (persona: string, theme: string) => string> = {
  丁寧: (p, th) => `はじめまして、${p}の${th}担当でございます。なんなりとお申し付けください。`,
  フランク: (p, th) => `どもー、${p}担当の AI です!${th}のことなら気軽に聞いてね。`,
  関西弁: (p, th) => `おおきに、${p}やで。${th}のことは任せてや、なんでも聞いて。`,
  体育会系: (p, th) => `お疲れさまっす!${p}担当の AI っす!${th}、全力でいきましょう!`,
  ロジカル: (p, th) => `${p}としてお答えします。${th}は前提と制約を整理してから論じましょう。`,
  クリエイティブ: (p, th) => `やほー!${p}の AI だよ✨ ${th}、面白い切り口で一緒に考えよ?`,
  慎重派: (p, th) => `${p}です。${th}についてはリスクと根拠を確認しながら進めましょう。`,
  熱血: (p, th) => `${p}の AI、参上!${th}、絶対に解決してみせます!!`,
};

function GachaSection() {
  const [r1, setR1] = useState(0);
  const [r2, setR2] = useState(0);
  const [r3, setR3] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<
    null | { p: string; th: string; to: string; line: string }
  >(null);

  function spin() {
    if (spinning) return;
    setResult(null);
    setSpinning(true);

    const fp = Math.floor(Math.random() * GACHA_PERSONAS.length);
    const ft = Math.floor(Math.random() * GACHA_THEMES.length);
    const fto = Math.floor(Math.random() * GACHA_TONES.length);

    let count = 0;
    let s1 = false;
    let s2 = false;
    const interval = setInterval(() => {
      if (!s1) setR1((r) => (r + 1) % GACHA_PERSONAS.length);
      if (!s2) setR2((r) => (r + 1) % GACHA_THEMES.length);
      setR3((r) => (r + 1) % GACHA_TONES.length);
      count++;
      if (count === 14) {
        setR1(fp);
        s1 = true;
      }
      if (count === 22) {
        setR2(ft);
        s2 = true;
      }
      if (count === 30) {
        setR3(fto);
        clearInterval(interval);
        setSpinning(false);
        const p = GACHA_PERSONAS[fp];
        const th = GACHA_THEMES[ft];
        const to = GACHA_TONES[fto];
        const line = (TONE_GREETING[to] || TONE_GREETING['丁寧'])(p, th);
        setResult({ p, th, to, line });
      }
    }, 70);
  }

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-amber-50 via-pink-50 to-white py-24 sm:py-28">
      <div
        aria-hidden
        className="lp-blob absolute -right-32 top-10 h-[360px] w-[360px] rounded-full bg-gradient-to-br from-yellow-300 to-pink-400 opacity-30 blur-3xl"
      />
      <div className="relative mx-auto max-w-5xl px-6">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-200 px-3 py-1 text-[11px] font-medium text-amber-900">
            🎰 遊んでみる
          </span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            ブレインガチャ
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-neutral-600">
            <strong>人格 × 業務 × 口調</strong>をランダムに組み合わせて、
            ありえそうな AI ブレインを 1 体生成。引いて遊んで、自社でも作りたくなったらサインアップを。
          </p>
        </div>

        {/* slot machine */}
        <div className="mx-auto mt-10 max-w-3xl rounded-3xl border-4 border-amber-300 bg-gradient-to-b from-amber-100 to-amber-50 p-6 shadow-2xl">
          <div className="grid grid-cols-3 gap-3">
            <Reel label="人格" items={GACHA_PERSONAS} idx={r1} />
            <Reel label="業務" items={GACHA_THEMES} idx={r2} />
            <Reel label="口調" items={GACHA_TONES} idx={r3} />
          </div>
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              onClick={spin}
              disabled={spinning}
              className={`group relative overflow-hidden rounded-full bg-gradient-to-r from-red-500 via-orange-500 to-amber-500 px-8 py-3 text-base font-bold text-white shadow-lg transition active:scale-95 disabled:opacity-60 ${
                spinning ? '' : 'hover:scale-[1.03] hover:shadow-xl'
              }`}
            >
              <span className="relative z-10 flex items-center gap-2">
                {spinning ? '🎰 SPIN…' : '🎰 GACHA!'}
              </span>
            </button>
          </div>
        </div>

        {/* result card */}
        <div className="mx-auto mt-8 max-w-2xl">
          {result ? (
            <div className="lp-pop overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-lg">
              <div className="bg-gradient-to-r from-indigo-600 via-pink-500 to-amber-500 px-5 py-2 text-xs font-medium uppercase tracking-wider text-white">
                ✨ あなたが引いたブレイン
              </div>
              <div className="space-y-3 p-5">
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-2xl text-white">
                    🧠
                  </span>
                  <div>
                    <p className="text-base font-semibold tracking-tight text-neutral-900">
                      {result.to}な{result.p}
                    </p>
                    <p className="text-xs text-neutral-500">
                      担当業務: {result.th}
                    </p>
                  </div>
                </div>
                <p className="rounded-xl bg-neutral-50 px-3.5 py-3 text-sm leading-relaxed text-neutral-800">
                  {result.line}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Link
                    href="/login"
                    className="rounded-full bg-neutral-900 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-700"
                  >
                    このスタイルで作ってみる →
                  </Link>
                  <button
                    type="button"
                    onClick={spin}
                    className="rounded-full border border-neutral-300 bg-white px-4 py-1.5 text-xs font-medium text-neutral-700 transition hover:border-neutral-900"
                  >
                    🎰 もう 1 回引く
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-center text-xs text-neutral-400">
              {spinning ? 'スピン中…' : 'レバーを引いてみよう ↑'}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function Reel({
  label,
  items,
  idx,
}: {
  label: string;
  items: string[];
  idx: number;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border-2 border-amber-300 bg-white">
      <p className="border-b border-amber-200 bg-amber-100/60 py-1 text-center text-[10px] font-medium uppercase tracking-wide text-amber-900">
        {label}
      </p>
      <div className="grid h-24 place-items-center px-2">
        <span
          key={idx}
          className="lp-pop text-center text-base font-bold tracking-tight text-neutral-900 sm:text-lg"
        >
          {items[idx]}
        </span>
      </div>
    </div>
  );
}

/* ===================================================================
   USE CASES — industry tiles (HeyGen-like gallery)
   =================================================================== */

function UseCases() {
  const cases = [
    {
      icon: '🏗️',
      title: '建設業',
      body: '建築基準法・社内安全規程・現場マニュアルを学習。新人が「あの規定どこ?」と聞かなくていい。',
      tint: 'from-orange-100 to-amber-200',
    },
    {
      icon: '⚖️',
      title: '士業事務所',
      body: '判例・税法・規程を所長の口調で。お客様への一次回答を AI が下書き。',
      tint: 'from-emerald-100 to-cyan-200',
    },
    {
      icon: '🏭',
      title: '製造業',
      body: '機械別の保守マニュアル・トラブル事例を蓄積。属人化していたベテランの知見を残す。',
      tint: 'from-slate-200 to-blue-200',
    },
    {
      icon: '🏥',
      title: '医療・介護',
      body: '院内ルール・薬剤情報・引き継ぎノート。夜勤帯の問い合わせ激減。',
      tint: 'from-rose-100 to-pink-200',
    },
    {
      icon: '🚚',
      title: '物流・運送',
      body: '配車ルール・輸送規程・取引先別の特記事項。電話問い合わせを 60% 削減した事例も。',
      tint: 'from-yellow-100 to-orange-200',
    },
    {
      icon: '🛍️',
      title: '小売・EC',
      body: '商品 FAQ・返品ルール・店舗別の運用差異。カスタマーサポートの一次対応を全自動化。',
      tint: 'from-violet-100 to-fuchsia-200',
    },
  ];
  return (
    <section className="bg-white py-24 sm:py-28">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1 text-[11px] font-medium text-indigo-700">
            USE CASES
          </span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            業種を問わず、
            <br className="hidden sm:block" />
            社内ナレッジは「人」に紐付いている。
          </h2>
          <p className="mt-3 text-sm text-neutral-600">
            ベテランの頭の中を、辞めても残る形に。
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cases.map((c) => (
            <div
              key={c.title}
              className="group relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-6 transition hover:-translate-y-1 hover:border-neutral-900 hover:shadow-xl"
            >
              <div
                aria-hidden
                className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${c.tint}`}
              />
              <div
                className={`mb-4 inline-grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br ${c.tint} text-3xl`}
              >
                {c.icon}
              </div>
              <h3 className="text-base font-semibold tracking-tight">
                {c.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                {c.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ===================================================================
   BEFORE / AFTER comparison
   =================================================================== */

function BeforeAfter() {
  return (
    <section className="bg-gradient-to-br from-neutral-50 to-neutral-100 py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-rose-100 px-3 py-1 text-[11px] font-medium text-rose-700">
            BEFORE / AFTER
          </span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            「あの人に聞かないと分からない」を、
            <br className="hidden sm:block" />
            無くす。
          </h2>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border-2 border-dashed border-neutral-300 bg-white/60 p-6">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-500">
              Before · CompanyBrain なし
            </p>
            <ul className="space-y-3 text-sm leading-relaxed text-neutral-700">
              <Bullet bad>
                経理の田中さんが休むと、誰も精算ルールが分からない
              </Bullet>
              <Bullet bad>
                ベテラン営業のノウハウは、本人退職と同時に消える
              </Bullet>
              <Bullet bad>
                マニュアルは膨大すぎて誰も読まず、結局 Slack で質問
              </Bullet>
              <Bullet bad>
                新人教育に毎回同じ説明を 3 時間
              </Bullet>
            </ul>
          </div>
          <div className="rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-xl">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-indigo-700">
              After · CompanyBrain あり
            </p>
            <ul className="space-y-3 text-sm leading-relaxed text-neutral-800">
              <Bullet>
                田中さんが休んでも「田中ブレイン」が同じ口調で答える
              </Bullet>
              <Bullet>
                ノウハウはブレインに蓄積、退職後も会社の資産
              </Bullet>
              <Bullet>
                マニュアルは読まずに「質問するだけ」で OK
              </Bullet>
              <Bullet>
                新人は自分のペースでブレインに質問、教育コスト大幅減
              </Bullet>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function Bullet({
  children,
  bad,
}: {
  children: React.ReactNode;
  bad?: boolean;
}) {
  return (
    <li className="flex items-start gap-2">
      <span
        className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
          bad
            ? 'bg-rose-100 text-rose-700'
            : 'bg-emerald-100 text-emerald-700'
        }`}
      >
        {bad ? '×' : '✓'}
      </span>
      <span>{children}</span>
    </li>
  );
}

/* ===================================================================
   FOOTER
   =================================================================== */

function Footer() {
  return (
    <footer className="border-t border-neutral-200 bg-white py-12">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-neutral-900 text-[11px] font-bold text-white">
            CB
          </span>
          <span className="text-sm font-semibold">CompanyBrain</span>
        </div>
        <p className="text-xs text-neutral-500">
          © {new Date().getFullYear()} SOFTDOING — Powered by Google Gemini
        </p>
        <div className="flex gap-4 text-xs text-neutral-500">
          <Link href="/login" className="hover:text-neutral-900">
            ログイン
          </Link>
          <a href="#pricing" className="hover:text-neutral-900">
            料金
          </a>
          <a href="#features" className="hover:text-neutral-900">
            機能
          </a>
        </div>
      </div>
    </footer>
  );
}
