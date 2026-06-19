'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { PLANS, type Plan } from '@/lib/plans';

export default function LandingClient() {
  // If the user arrived from /login (or anywhere) with a hash like
  // /#features, React mounts after the browser's first scroll attempt,
  // so the section often isn't there yet. Re-scroll once we're mounted.
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el) {
      // Defer one frame so layout has settled.
      requestAnimationFrame(() =>
        el.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      );
    }
  }, []);

  return (
    <div className="lp-bleed lp-bg -mt-6 -mb-6 sm:-mt-8 sm:-mb-8">
      {/* Floating coloured orbs that drift across the whole landing.
          Fixed-position so they stay visible as the user scrolls. */}
      <div className="lp-orbs" aria-hidden>
        <div className="lp-orb lp-orb-1" />
        <div className="lp-orb lp-orb-2" />
        <div className="lp-orb lp-orb-3" />
        <div className="lp-orb lp-orb-4" />
        <div className="lp-orb lp-orb-5" />
      </div>
      <Hero />
      <PlaygroundDemo />
      <Features />
      <SamplePreviews />
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
   HERO — same visual language as /login: white background, dark
   rounded brand mark, restrained typography, soft-shadowed card on
   the right. No neon gradients.
   =================================================================== */

function Hero() {
  return (
    <section className="lp-sect-light relative isolate overflow-hidden">
      {/* very subtle dot grid, barely visible — gives depth without noise */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-[0.35]"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(0,0,0,0.08) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      />
      <div className="mx-auto grid max-w-6xl gap-12 px-6 pb-20 pt-20 sm:pt-28 md:grid-cols-[1.05fr_1fr] md:items-center md:gap-16 md:pb-28">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1 text-[11px] font-medium tracking-wide text-neutral-600 shadow-sm">
            <span className="grid h-1.5 w-1.5 place-items-center rounded-full bg-emerald-500" />
            Powered by Google Gemini
          </span>
          <h1 className="mt-5 text-4xl font-semibold leading-[1.2] tracking-tight text-neutral-900 sm:text-5xl md:text-[56px]">
            社員の知識と話し方を、
            <br />
            AI が引き継ぐ。
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
            CompanyBrain は社内資料・マニュアル・議事録を学習し、
            指定した人物の口調でリアルタイムに会話する社内ナレッジ AI です。
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700"
            >
              無料ではじめる
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                <path
                  d="M3 7h8M8 4l3 3-3 3"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
            </Link>
            <a
              href="#pricing"
              className="inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-5 py-2.5 text-sm font-medium text-neutral-700 transition hover:border-neutral-900 hover:text-neutral-900"
            >
              料金を見る
            </a>
          </div>
        </div>

        <HeroDemoCard />
      </div>
    </section>
  );
}

/**
 * Right-side decoration: a stylized chat preview card. Static UI, no
 * fake API calls — just a clean snapshot of what the product feels like.
 * Built with the same shapes (rounded-2xl, border-neutral-200, soft
 * shadow) as the /login card.
 */
function HeroDemoCard() {
  return (
    <div className="relative">
      {/* faint backdrop card stacked behind for depth */}
      <div className="absolute -inset-3 -z-10 rounded-3xl bg-neutral-100" />
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-neutral-100 px-4 py-2.5">
          <span className="h-2 w-2 rounded-full bg-neutral-300" />
          <span className="h-2 w-2 rounded-full bg-neutral-300" />
          <span className="h-2 w-2 rounded-full bg-neutral-300" />
          <span className="ml-2 text-[11px] text-neutral-400">
            経理ヘルプデスク · CompanyBrain
          </span>
        </div>
        <div className="space-y-3 p-5">
          <div className="flex justify-end">
            <div className="max-w-[80%] rounded-2xl rounded-tr-md bg-neutral-900 px-3.5 py-2 text-sm text-white">
              出張交通費の上限は?
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-neutral-900 text-[10px] font-bold tracking-tight text-white">
              CB
            </span>
            <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-neutral-100 px-3.5 py-2 text-sm leading-relaxed text-neutral-800">
              新幹線は普通車指定席まで、宿泊費は 1 泊 12,000 円(東京・大阪は 15,000 円)が上限です。
              領収書は必ず添付してください。
            </div>
          </div>
          <div className="flex items-start gap-2 pt-1 text-[11px] text-neutral-400">
            <span>参考: 出張旅費規程 第 4 条</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===================================================================
   PLAYGROUND DEMO — interactive sample chat (kept, restyled minimal)
   =================================================================== */

type DemoPersona = {
  id: string;
  name: string;
  /** 2-character short tag shown on the persona avatar tile. */
  tag: string;
  bio: string;
  qa: { q: string; a: string }[];
};

const DEMO_PERSONAS: DemoPersona[] = [
  {
    id: 'accounting',
    name: '経理ヘルプデスク',
    tag: '経理',
    bio: '経理部の規程に詳しい仮想アシスタント',
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
        a: '原則として帰国日翌営業日の TTM レート(三菱 UFJ 銀行)を使用します。クレジットカード払いの場合は明細記載の換算レートを優先します。',
      },
    ],
  },
  {
    id: 'sales',
    name: '営業 トップセールス',
    tag: '営業',
    bio: '営業部長の口調と知識を学んだブレイン',
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
    tag: '技術',
    bio: '社内コード規約・設計判断のレビュアー',
    qa: [
      {
        q: 'PR レビューで一番見るポイントは?',
        a: '読んで意図が伝わるかどうか。動くコードは前提で、3 ヶ月後の自分が見て困らないかを意識してる。命名 > テスト > 構造、の順で見ることが多い。',
      },
      {
        q: 'マイクロサービスはいつ採用すべき?',
        a: '組織のサイズが先で、技術判断は後。チームが 3 つ以上独立して動き始めたら検討。それまではモジュラーモノリスで十分。',
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

  useEffect(() => {
    setActiveQ(null);
    setTyped('');
  }, [personaId]);

  useEffect(() => {
    if (activeQ === null) return;
    const full = persona.qa[activeQ].a;
    setThinking(true);
    setTyped('');
    let cancelled = false;
    const t = setTimeout(() => {
      if (cancelled) return;
      setThinking(false);
      let i = 0;
      const tick = () => {
        if (cancelled) return;
        i += 1;
        setTyped(full.slice(0, i));
        if (i < full.length) {
          const delay = /[、。!?]/.test(full[i - 1] ?? '') ? 80 : 22;
          window.setTimeout(tick, delay);
        }
      };
      tick();
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [activeQ, persona]);

  return (
    <section id="demo" className="lp-sect-soft py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="DEMO"
          title="話しかけてみる"
          subtitle="実際の CompanyBrain は人物の動画・社内資料を学習させて作ります。下はサンプルです。"
        />
        <div className="mt-12 grid gap-5 lg:grid-cols-[260px_1fr]">
          <div className="space-y-2">
            {DEMO_PERSONAS.map((p) => {
              const active = p.id === personaId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPersonaId(p.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${
                    active
                      ? 'border-neutral-900 bg-white shadow-sm'
                      : 'border-neutral-200 bg-white hover:border-neutral-400'
                  }`}
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-neutral-900 text-[11px] font-bold tracking-tight text-white">
                    {p.tag}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-neutral-900">
                      {p.name}
                    </span>
                    <span className="block truncate text-[11px] text-neutral-500">
                      {p.bio}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-neutral-100 px-4 py-2.5">
              <span className="h-2 w-2 rounded-full bg-neutral-300" />
              <span className="h-2 w-2 rounded-full bg-neutral-300" />
              <span className="h-2 w-2 rounded-full bg-neutral-300" />
              <span className="ml-2 text-[11px] text-neutral-400">
                {persona.name} · CompanyBrain
              </span>
            </div>

            <div className="flex h-[420px] flex-col">
              <div className="flex-1 space-y-4 overflow-y-auto p-5">
                <div className="flex items-start gap-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-neutral-900 text-[10px] font-bold tracking-tight text-white">
                    {persona.tag}
                  </span>
                  <div className="max-w-[80%] rounded-2xl rounded-tl-md bg-neutral-100 px-3.5 py-2 text-sm text-neutral-800">
                    こんにちは。{persona.bio}です。下から質問を選んでみてください。
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
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-neutral-900 text-[10px] font-bold tracking-tight text-white">
                        {persona.tag}
                      </span>
                      <div className="max-w-[80%] rounded-2xl rounded-tl-md bg-neutral-100 px-3.5 py-2 text-sm leading-relaxed text-neutral-800">
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
   FEATURES — dynamic cards with line icons + accent + detail chips
   =================================================================== */

type Feature = {
  icon: keyof typeof ICONS;
  title: string;
  body: string;
  detail: string;
  accent: string; // gradient for icon + hover glow
};

function Features() {
  const items: Feature[] = [
    {
      icon: 'video',
      title: '動画から人格を学習',
      body: '対象人物の動画をアップロードするだけで、表情・話し方・口癖まで取り込みます。',
      detail: '話者の口調をそのまま再現',
      accent: 'from-indigo-500 to-violet-600',
    },
    {
      icon: 'mic',
      title: 'リアルタイム音声会話',
      body: 'Gemini Live による 1〜3 秒の超低遅延応答。会議中の壁打ち相手としても。',
      detail: '応答 1〜3 秒・押して話す',
      accent: 'from-rose-500 to-orange-500',
    },
    {
      icon: 'docs',
      title: '社内資料を一括学習',
      body: 'PDF・議事録・規程・URL をまとめて投入。意味で検索して答えます。',
      detail: 'pgvector 意味検索',
      accent: 'from-sky-500 to-cyan-500',
    },
    {
      icon: 'shield',
      title: '完全プライベート',
      body: 'ブレインは作成者本人だけが利用可能。他のユーザーや管理者にも中身は見えません。',
      detail: '所有者のみアクセス',
      accent: 'from-emerald-500 to-teal-600',
    },
    {
      icon: 'log',
      title: '監査ログ完備',
      body: '質問・回答・素材投入まで全履歴を記録。コンプライアンス要件にも対応します。',
      detail: '全操作を追跡・CSV 出力',
      accent: 'from-amber-500 to-yellow-500',
    },
    {
      icon: 'handoff',
      title: 'ブレイン作成を依頼',
      body: '「こういうブレインが欲しい」と社員が管理者に依頼。完成後は依頼者へ所有権を譲渡。',
      detail: '依頼 → 作成 → 譲渡',
      accent: 'from-fuchsia-500 to-purple-600',
    },
  ];
  return (
    <section id="features" className="lp-sect-light py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="FEATURES"
          title="必要な機能を、過不足なく。"
          subtitle="ナレッジを「人」に紐付けて残すための機能を、ひと通り。"
        />
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((f) => {
            const Icon = ICONS[f.icon];
            return (
              <div
                key={f.title}
                className="group relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-6 transition duration-300 hover:-translate-y-1 hover:border-transparent hover:shadow-2xl"
              >
                {/* hover glow */}
                <div
                  aria-hidden
                  className={`pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br ${f.accent} opacity-0 blur-2xl transition duration-500 group-hover:opacity-20`}
                />
                {/* top accent line on hover */}
                <div
                  aria-hidden
                  className={`absolute inset-x-0 top-0 h-1 origin-left scale-x-0 bg-gradient-to-r ${f.accent} transition-transform duration-300 group-hover:scale-x-100`}
                />
                <div
                  className={`grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br ${f.accent} text-white shadow-lg transition duration-300 group-hover:scale-110 group-hover:-rotate-3`}
                >
                  <Icon />
                </div>
                <h3 className="mt-5 text-lg font-semibold tracking-tight">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                  {f.body}
                </p>
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1 text-[11px] font-medium text-neutral-600 transition group-hover:bg-neutral-900 group-hover:text-white">
                  <span className="text-[9px]">●</span>
                  {f.detail}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* Inline line-icon set (stroke style, 24px grid). */
const ICONS = {
  video: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
      <path d="M15.5 10l6-3.2v10.4l-6-3.2" />
    </svg>
  ),
  mic: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
    </svg>
  ),
  docs: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2.5H7A2.5 2.5 0 0 0 4.5 5v14A2.5 2.5 0 0 0 7 21.5h10A2.5 2.5 0 0 0 19.5 19V8z" />
      <path d="M14 2.5V8h5.5M8 13h8M8 16.5h5" />
    </svg>
  ),
  shield: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2.5l7.5 3v5.5c0 4.7-3.2 8.3-7.5 10-4.3-1.7-7.5-5.3-7.5-10V5.5z" />
      <path d="M9 12l2 2 4-4.5" />
    </svg>
  ),
  log: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  ),
  handoff: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8h13M12 4l4 4-4 4" />
      <path d="M21 16H8M12 12l-4 4 4 4" />
    </svg>
  ),
};

/* ===================================================================
   SAMPLE PREVIEWS — tabbed mock-ups for the marquee features
   =================================================================== */

type SampleKey = 'video' | 'voice' | 'audit';
const SAMPLE_TABS: { key: SampleKey; label: string; emoji: string }[] = [
  { key: 'video', label: '動画から人格を学習', emoji: '🎥' },
  { key: 'voice', label: 'リアルタイム音声会話', emoji: '🎙️' },
  { key: 'audit', label: '監査ログ完備', emoji: '📋' },
];

function SamplePreviews() {
  const [tab, setTab] = useState<SampleKey>('video');
  return (
    <section className="lp-sect-light py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="SAMPLES"
          title="主要機能の見本"
          subtitle="実際の画面にどう映るかをイメージ用にお見せします。"
        />
        <div className="mt-10 flex flex-wrap justify-center gap-2">
          {SAMPLE_TABS.map((t) => {
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-medium transition ${
                  active
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-900'
                }`}
              >
                <span>{t.emoji}</span>
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="mt-8">
          {tab === 'video' && <VideoLearnMock />}
          {tab === 'voice' && <VoiceChatMock />}
          {tab === 'audit' && <AuditLogMock />}
        </div>
      </div>
    </section>
  );
}

/* ----- Mock 1: 動画から人格を学習 ----- */
function VideoLearnMock() {
  const steps = [
    { done: true, label: '動画アップロード', detail: '田中部長_社内研修.mp4 (42 MB)' },
    { done: true, label: '音声を文字起こし', detail: '24 分 13 秒 / 4,872 文字' },
    { done: true, label: '発言を意味で分割', detail: '152 チャンク生成' },
    { done: true, label: 'ベクトル化して保存', detail: 'pgvector に 152 件登録' },
    { done: true, label: '人格プロファイル完成', detail: '口調・価値観・話し方を抽出済み' },
  ];
  return (
    <div className="grid gap-5 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm md:grid-cols-[1.1fr_1fr]">
      <div>
        <div className="overflow-hidden rounded-xl bg-neutral-900">
          <div className="grid aspect-video place-items-center text-neutral-500">
            <div className="text-center">
              <div className="text-4xl">▶</div>
              <p className="mt-2 text-xs">田中部長_社内研修.mp4</p>
              <p className="text-[10px] text-neutral-600">24:13</p>
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-neutral-900 text-[10px] font-bold tracking-tight text-white">
            CB
          </span>
          <div>
            <p className="text-sm font-medium text-neutral-900">
              経理部 田中部長
            </p>
            <p className="text-[11px] text-emerald-700">学習完了 · 質問できます</p>
          </div>
        </div>
      </div>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={s.label} className="flex items-start gap-3">
            <span
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                s.done
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-neutral-100 text-neutral-400'
              }`}
            >
              {s.done ? '✓' : i + 1}
            </span>
            <div>
              <p className="text-sm font-medium text-neutral-900">{s.label}</p>
              <p className="text-[11px] text-neutral-500">{s.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ----- Mock 2: リアルタイム音声会話 ----- */
function VoiceChatMock() {
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-neutral-100 px-4 py-2.5">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        <span className="text-[11px] text-neutral-500">
          ライブ中 · 応答 1.4 秒 · Gemini Live
        </span>
      </div>
      <div className="grid gap-6 p-6 md:grid-cols-[1fr_1.1fr]">
        <div className="flex flex-col items-center justify-center rounded-2xl bg-neutral-50 p-6 text-center">
          <div className="relative">
            <span className="grid h-24 w-24 place-items-center rounded-full bg-neutral-900 text-lg font-bold tracking-tight text-white">
              CB
            </span>
            <span className="absolute -inset-2 rounded-full border-2 border-emerald-500/40" />
          </div>
          <p className="mt-4 text-sm font-medium text-neutral-900">
            営業部 佐藤さん
          </p>
          <p className="text-[11px] text-neutral-500">音声で対話中</p>
          <button
            type="button"
            disabled
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-red-500 px-4 py-2 text-xs font-medium text-white shadow"
          >
            🎙 押して話す
          </button>
          <div className="mt-4 flex h-8 w-32 items-end justify-center gap-1">
            {[8, 14, 22, 30, 24, 32, 18, 26, 12, 20].map((h, i) => (
              <span
                key={i}
                className="w-1.5 rounded-sm bg-neutral-400"
                style={{ height: `${h}px` }}
              />
            ))}
          </div>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-neutral-900 px-3.5 py-2 text-white">
              先方が値引き要請してきたんだけど、どう返すべき?
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-neutral-900 text-[10px] font-bold tracking-tight text-white">
              CB
            </span>
            <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-neutral-100 px-3.5 py-2 leading-relaxed text-neutral-800">
              ゼロ条件で値引きしちゃダメだ。「年契約なら 10% 引きます」とか、必ず条件交換にしよう。相場を崩すと後で全部刺さるよ。
            </div>
          </div>
          <p className="pt-2 text-[10px] text-neutral-400">
            ※ 録音は監査ログに残ります
          </p>
        </div>
      </div>
    </div>
  );
}

/* ----- Mock 3: 監査ログ完備 ----- */
function AuditLogMock() {
  const rows = [
    { time: '2026/06/18 10:23', user: '田中', action: '質問', target: '経理ブレイン', detail: '出張交通費の上限は?' },
    { time: '2026/06/18 10:45', user: '山田', action: '素材投入', target: '営業ブレイン', detail: '営業手帳_2026.pdf を追加' },
    { time: '2026/06/18 11:02', user: '佐藤', action: '音声会話', target: '営業ブレイン', detail: '4 分 18 秒' },
    { time: '2026/06/18 11:30', user: '田中', action: '質問', target: '経理ブレイン', detail: '海外出張のレート換算は?' },
    { time: '2026/06/18 12:14', user: '管理者', action: '譲渡', target: '法務ブレイン', detail: '佐藤 → 鈴木 へ' },
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 bg-neutral-50/60 px-4 py-2.5">
        <span className="text-[11px] font-medium text-neutral-700">
          📋 監査ログ
        </span>
        <div className="flex gap-2">
          <span className="rounded-full border border-neutral-300 bg-white px-2.5 py-1 text-[10px] text-neutral-500">
            🔍 ユーザーで絞り込み
          </span>
          <span className="rounded-full border border-neutral-300 bg-white px-2.5 py-1 text-[10px] text-neutral-500">
            ⇩ CSV ダウンロード
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-neutral-50/60 text-neutral-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">時刻</th>
              <th className="px-4 py-2 text-left font-medium">ユーザー</th>
              <th className="px-4 py-2 text-left font-medium">アクション</th>
              <th className="px-4 py-2 text-left font-medium">対象</th>
              <th className="px-4 py-2 text-left font-medium">詳細</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 text-neutral-800">
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="whitespace-nowrap px-4 py-2 text-neutral-500">
                  {r.time}
                </td>
                <td className="whitespace-nowrap px-4 py-2 font-medium">
                  {r.user}
                </td>
                <td className="whitespace-nowrap px-4 py-2">
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-700">
                    {r.action}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-2">{r.target}</td>
                <td className="px-4 py-2 text-neutral-600">{r.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ===================================================================
   HOW IT WORKS — 3 horizontal steps
   =================================================================== */

function HowItWorks() {
  const steps = [
    { n: 1, title: 'ブレインを作る', body: '名前を決めて、人物の動画と社内資料をアップロード。素材はあとから追加もできます。' },
    { n: 2, title: '質問する', body: 'チャットで聞いてもよし、🎙 ボタンで音声会話してもよし。' },
    { n: 3, title: 'チームに渡す', body: '完成したブレインは「依頼ワークフロー」で同僚に譲渡。組織知が個人を越えて残る。' },
  ];
  return (
    <section className="lp-sect-soft py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading eyebrow="HOW IT WORKS" title="3 ステップで導入。" />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {steps.map((s) => (
            <div
              key={s.n}
              className="rounded-2xl border border-neutral-200 bg-white p-6"
            >
              <span className="grid h-8 w-8 place-items-center rounded-full bg-neutral-900 text-xs font-semibold text-white">
                {s.n}
              </span>
              <h3 className="mt-3 text-base font-semibold tracking-tight">
                {s.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ===================================================================
   USE CASES
   =================================================================== */

function UseCases() {
  const cases = [
    { icon: '🏗️', title: '建設業', body: '建築基準法・社内安全規程・現場マニュアルを学習。新人が「あの規定どこ?」と聞かなくていい。' },
    { icon: '⚖️', title: '士業事務所', body: '判例・税法・規程を所長の口調で。お客様への一次回答を AI が下書き。' },
    { icon: '🏭', title: '製造業', body: '機械別の保守マニュアル・トラブル事例を蓄積。属人化していた知見を残す。' },
    { icon: '🏥', title: '医療・介護', body: '院内ルール・薬剤情報・引き継ぎノート。夜勤帯の問い合わせを削減。' },
    { icon: '🚚', title: '物流・運送', body: '配車ルール・輸送規程・取引先別の特記事項を瞬時に照会。' },
    { icon: '🛍️', title: '小売・EC', body: '商品 FAQ・返品ルール・店舗別の運用差異。カスタマーサポートを支援。' },
  ];
  return (
    <section className="lp-sect-light py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="USE CASES"
          title="業種を問わず、社内ナレッジは「人」に紐付いている。"
          subtitle="ベテランの頭の中を、辞めても残る形に。"
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cases.map((c) => (
            <div
              key={c.title}
              className="rounded-2xl border border-neutral-200 bg-white p-6 transition hover:border-neutral-900"
            >
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-neutral-900 text-xl text-white">
                {c.icon}
              </div>
              <h3 className="mt-4 text-base font-semibold tracking-tight">
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
   BEFORE / AFTER
   =================================================================== */

function BeforeAfter() {
  return (
    <section className="lp-sect-soft py-24 sm:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <SectionHeading
          eyebrow="BEFORE / AFTER"
          title="「あの人に聞かないと分からない」を無くす。"
        />
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-neutral-200 bg-white p-6">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-neutral-400">
              Before
            </p>
            <ul className="space-y-3 text-sm leading-relaxed text-neutral-700">
              <Bullet bad>経理担当が休むと、誰も精算ルールが分からない</Bullet>
              <Bullet bad>ベテラン営業のノウハウは退職と同時に消える</Bullet>
              <Bullet bad>マニュアルは膨大すぎて誰も読まず、Slack で質問</Bullet>
              <Bullet bad>新人教育に毎回同じ説明を 3 時間</Bullet>
            </ul>
          </div>
          <div className="rounded-2xl border border-neutral-900 bg-neutral-900 p-6 text-white">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-neutral-400">
              After
            </p>
            <ul className="space-y-3 text-sm leading-relaxed">
              <Bullet onDark>担当が休んでも「ブレイン」が同じ口調で答える</Bullet>
              <Bullet onDark>ノウハウはブレインに蓄積、退職後も会社の資産</Bullet>
              <Bullet onDark>マニュアルは読まずに「質問するだけ」で OK</Bullet>
              <Bullet onDark>新人は自分のペースでブレインに質問、教育コスト減</Bullet>
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
  onDark,
}: {
  children: React.ReactNode;
  bad?: boolean;
  onDark?: boolean;
}) {
  return (
    <li className="flex items-start gap-2">
      <span
        className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
          bad
            ? 'bg-neutral-100 text-neutral-500'
            : onDark
            ? 'bg-white text-neutral-900'
            : 'bg-neutral-900 text-white'
        }`}
      >
        {bad ? '×' : '✓'}
      </span>
      <span>{children}</span>
    </li>
  );
}

/* ===================================================================
   PRICING
   =================================================================== */

function Pricing() {
  return (
    <section id="pricing" className="lp-sect-light py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeading
          eyebrow="PRICING"
          title="まずは無料で。成長に合わせて選べる 4 プラン。"
          subtitle="年契約で 2 ヶ月分無料 · いつでもアップグレード / 解約可能 · 税抜"
        />
        <div className="mx-auto mt-6 max-w-2xl rounded-2xl border border-neutral-200 bg-neutral-50 px-5 py-3 text-center text-sm text-neutral-700">
          ✨ <span className="font-medium">上位プランほど、より高精度な AI モデルを利用できます。</span>
          フリー / スターターは高速モデル、スタンダードは高精度モデル、
          プロは常に最新最上位モデルへ自動アップグレードされます。
        </div>
        <div className="mt-12 grid gap-5 lg:grid-cols-4">
          {PLANS.map((p) => (
            <PlanCard key={p.id} plan={p} />
          ))}
        </div>
        <p className="mt-10 text-center text-xs text-neutral-500">
          ※ Gemini Live (音声) は弊社で API 料金を負担しているため、各プランの上限内で課金されません。
        </p>
      </div>
    </section>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  const isFree = plan.priceJpy === 0;
  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-6 transition ${
        plan.highlighted
          ? 'border-neutral-900 bg-neutral-900 text-white'
          : 'border-neutral-200 bg-white'
      }`}
    >
      {plan.highlighted && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-900 shadow">
          人気
        </span>
      )}
      <p
        className={`text-xs font-medium ${
          plan.highlighted ? 'text-neutral-400' : 'text-neutral-500'
        }`}
      >
        {plan.bestFor}
      </p>
      <h3 className="mt-1 text-xl font-semibold tracking-tight">{plan.name}</h3>
      <p
        className={`mt-1 text-xs ${
          plan.highlighted ? 'text-neutral-400' : 'text-neutral-500'
        }`}
      >
        {plan.tagline}
      </p>

      <div className="mt-5">
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-semibold tracking-tight">
            ¥{plan.priceJpy.toLocaleString('ja-JP')}
          </span>
          <span
            className={`text-sm ${
              plan.highlighted ? 'text-neutral-400' : 'text-neutral-500'
            }`}
          >
            / 月
          </span>
        </div>
        <p
          className={`mt-1 text-[11px] ${
            plan.highlighted ? 'text-neutral-400' : 'text-neutral-500'
          }`}
        >
          {plan.priceNote}
        </p>
      </div>

      <Link
        href="/signup"
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
              width="14"
              height="14"
              viewBox="0 0 16 16"
              aria-hidden
              className={`mt-1 shrink-0 ${
                plan.highlighted ? 'text-white' : 'text-neutral-900'
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
    { q: 'プラン変更や解約はいつでも可能ですか?', a: 'はい。マイページからいつでもアップグレード・ダウングレード・解約できます。日割り計算で清算します。' },
    { q: 'AI モデルの違いは?', a: 'Flash は高速・低コスト、Pro は精度重視、2.5 Pro は最高精度です。上位プランではより正確で文脈理解の深い回答が得られます。' },
    { q: 'データは AI の学習に使われますか?', a: 'いいえ。投入された資料・質問・回答は外部の学習データには使用されません。すべてあなたの環境に閉じています。' },
    { q: '音声会話の上限を超えたらどうなりますか?', a: '上限を超えた時点で自動的にテキスト回答モードに切り替わります。追加課金は発生しません。' },
    { q: '個人事業主でも使えますか?', a: 'もちろんです。フリー / スタータープランが特に個人 〜 小規模事業者向けに作られています。' },
  ];
  return (
    <section className="lp-sect-soft py-24 sm:py-28">
      <div className="mx-auto max-w-3xl px-6">
        <SectionHeading eyebrow="FAQ" title="よくあるご質問" />
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
   FINAL CTA — styled like the login card itself
   =================================================================== */

function FinalCta() {
  return (
    <section className="lp-sect-light py-24 sm:py-32">
      <div className="mx-auto max-w-md px-6 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-neutral-900 text-sm font-bold tracking-tight text-white">
          CB
        </div>
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          あなたの会社にも、
          <br />
          もう一人の自分を。
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-neutral-500">
          フリープランで今すぐ試せます。クレジットカード不要、1 分で始められます。
        </p>
        <div className="mt-7 flex justify-center gap-3">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700"
          >
            無料ではじめる
          </Link>
          <a
            href="#pricing"
            className="inline-flex items-center justify-center rounded-full border border-neutral-300 bg-white px-5 py-2.5 text-sm font-medium text-neutral-700 transition hover:border-neutral-900 hover:text-neutral-900"
          >
            料金を見る
          </a>
        </div>
      </div>
    </section>
  );
}

/* ===================================================================
   FOOTER
   =================================================================== */

function Footer() {
  return (
    <footer className="lp-sect-light border-t border-neutral-200 py-10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6">
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

/* ===================================================================
   Shared heading block
   =================================================================== */

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-neutral-400">
        {eyebrow}
      </span>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-3 text-sm leading-relaxed text-neutral-500">
          {subtitle}
        </p>
      )}
    </div>
  );
}
