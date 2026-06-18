'use client';

/**
 * Animated, blurred backdrop for the login screen: several columns of
 * mock "demo" cards drifting upward at different speeds over soft
 * colored gradient light. Sits fixed behind everything, blurred and
 * faded, with a light wash on top so the login card stays readable.
 */

type DemoCard = {
  emoji: string;
  name: string;
  line: string;
  grad: string; // tailwind gradient for the avatar + accent
};

const CARDS: DemoCard[] = [
  { emoji: '💼', name: '経理ヘルプデスク', line: '出張交通費の上限は新幹線が普通車指定席まで…', grad: 'from-indigo-500 to-violet-600' },
  { emoji: '🚀', name: '営業 トップセールス', line: '値引きには必ず条件交換をぶつけるんだ。', grad: 'from-rose-500 to-orange-500' },
  { emoji: '⚡', name: 'シニアエンジニア', line: '命名 > テスト > 構造、の順で見ることが多い。', grad: 'from-emerald-500 to-teal-500' },
  { emoji: '🏗️', name: '建築法務ブレイン', line: '建築基準法 第42条の道路の定義について…', grad: 'from-amber-500 to-yellow-500' },
  { emoji: '⚖️', name: '顧問税理士', line: '交際費は1人5,000円以下なら会議費に…', grad: 'from-sky-500 to-cyan-500' },
  { emoji: '🏥', name: '院内ルール', line: '夜勤帯の薬剤受け渡しは二名確認が原則です。', grad: 'from-pink-500 to-fuchsia-600' },
  { emoji: '🚚', name: '配車マネージャー', line: '長距離便の休憩は4時間ごとに必須です。', grad: 'from-lime-500 to-green-600' },
  { emoji: '🛍️', name: '店舗 FAQ', line: '返品はレシートがあれば14日以内で対応可能。', grad: 'from-violet-500 to-purple-600' },
  { emoji: '📊', name: '経営企画ブレイン', line: '前年同月比で粗利率は2.3pt改善しています。', grad: 'from-blue-500 to-indigo-600' },
  { emoji: '🧑‍🏫', name: '新人研修トレーナー', line: 'まずは名刺交換の所作から確認しましょう。', grad: 'from-orange-500 to-red-500' },
  { emoji: '🏭', name: '保守マニュアル', line: '3号機のエラーE07はベルト張力を確認。', grad: 'from-cyan-500 to-blue-500' },
  { emoji: '📝', name: '議事録要約', line: '本日の決定事項は3点、担当と期日は以下に…', grad: 'from-teal-500 to-emerald-600' },
];

function Card({ c }: { c: DemoCard }) {
  return (
    <div className="w-64 rounded-2xl border border-white/70 bg-white/90 p-4 shadow-md backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br ${c.grad} text-sm text-white shadow`}
        >
          {c.emoji}
        </span>
        <span className="text-xs font-medium text-neutral-900">{c.name}</span>
      </div>
      <p className="mt-3 rounded-xl bg-neutral-100 px-3 py-2 text-[11px] leading-relaxed text-neutral-700">
        {c.line}
      </p>
      <div className="mt-2 flex justify-end">
        <span
          className={`rounded-full bg-gradient-to-r ${c.grad} px-2.5 py-1 text-[10px] text-white`}
        >
          🎙 音声で質問
        </span>
      </div>
    </div>
  );
}

function Column({
  cards,
  duration,
  delay = 0,
}: {
  cards: DemoCard[];
  duration: number;
  delay?: number;
}) {
  // Duplicate the list so the upward loop is seamless.
  const loop = [...cards, ...cards];
  return (
    <div className="relative h-full w-64 overflow-hidden">
      <div
        className="flex flex-col gap-5 lp-rise"
        style={{ animationDuration: `${duration}s`, animationDelay: `${delay}s` }}
      >
        {loop.map((c, i) => (
          <Card key={i} c={c} />
        ))}
      </div>
    </div>
  );
}

export default function LoginBackground() {
  // Spread the deck across columns with varied speeds for parallax.
  const colA = [CARDS[0], CARDS[3], CARDS[6], CARDS[9]];
  const colB = [CARDS[1], CARDS[4], CARDS[7], CARDS[10]];
  const colC = [CARDS[2], CARDS[5], CARDS[8], CARDS[11]];
  const colD = [CARDS[9], CARDS[2], CARDS[5], CARDS[0]];
  const colE = [CARDS[11], CARDS[6], CARDS[1], CARDS[8]];

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-gradient-to-br from-indigo-50 via-rose-50 to-amber-50"
    >
      {/* soft colored gradient light */}
      <div className="absolute -left-24 top-10 h-[420px] w-[420px] rounded-full bg-gradient-to-br from-indigo-300/50 to-violet-300/50 blur-3xl" />
      <div className="absolute -right-24 top-1/3 h-[440px] w-[440px] rounded-full bg-gradient-to-br from-rose-300/50 to-orange-200/50 blur-3xl" />
      <div className="absolute bottom-0 left-1/3 h-[380px] w-[380px] rounded-full bg-gradient-to-br from-emerald-200/50 to-cyan-300/50 blur-3xl" />

      {/* drifting columns, blurred */}
      <div className="absolute inset-0 flex justify-center gap-5 opacity-70 blur-[3px] sm:gap-7">
        <Column cards={colA} duration={34} />
        <Column cards={colB} duration={42} delay={-6} />
        <Column cards={colC} duration={30} delay={-12} />
        <Column cards={colD} duration={46} delay={-3} />
        <Column cards={colE} duration={38} delay={-9} />
      </div>

      {/* light wash so the foreground login card stays readable */}
      <div className="absolute inset-0 bg-white/45" />
      {/* soft radial focus behind the centered card */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(440px circle at 50% 45%, rgba(255,255,255,0.9), transparent 72%)',
        }}
      />
    </div>
  );
}
