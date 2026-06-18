'use client';

/**
 * Animated, blurred backdrop for the login screen: several columns of
 * mock "demo" cards drifting upward at different speeds. Sits fixed
 * behind everything, heavily blurred and faded, with a white wash on
 * top so the login card stays perfectly readable.
 */

type DemoCard = {
  emoji: string;
  name: string;
  line: string;
};

const CARDS: DemoCard[] = [
  { emoji: '💼', name: '経理ヘルプデスク', line: '出張交通費の上限は新幹線が普通車指定席まで…' },
  { emoji: '🚀', name: '営業 トップセールス', line: '値引きには必ず条件交換をぶつけるんだ。' },
  { emoji: '⚡', name: 'シニアエンジニア', line: '命名 > テスト > 構造、の順で見ることが多い。' },
  { emoji: '🏗️', name: '建築法務ブレイン', line: '建築基準法 第42条の道路の定義について…' },
  { emoji: '⚖️', name: '顧問税理士', line: '交際費は1人5,000円以下なら会議費に…' },
  { emoji: '🏥', name: '院内ルール', line: '夜勤帯の薬剤受け渡しは二名確認が原則です。' },
  { emoji: '🚚', name: '配車マネージャー', line: '長距離便の休憩は4時間ごとに必須です。' },
  { emoji: '🛍️', name: '店舗 FAQ', line: '返品はレシートがあれば14日以内で対応可能。' },
  { emoji: '📊', name: '経営企画ブレイン', line: '前年同月比で粗利率は2.3pt改善しています。' },
  { emoji: '🧑‍🏫', name: '新人研修トレーナー', line: 'まずは名刺交換の所作から確認しましょう。' },
  { emoji: '🏭', name: '保守マニュアル', line: '3号機のエラーE07はベルト張力を確認。' },
  { emoji: '📝', name: '議事録要約', line: '本日の決定事項は3点、担当と期日は以下に…' },
];

function Card({ c }: { c: DemoCard }) {
  return (
    <div className="w-64 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-neutral-900 text-sm text-white">
          {c.emoji}
        </span>
        <span className="text-xs font-medium text-neutral-900">{c.name}</span>
      </div>
      <p className="mt-3 rounded-xl bg-neutral-100 px-3 py-2 text-[11px] leading-relaxed text-neutral-700">
        {c.line}
      </p>
      <div className="mt-2 flex justify-end">
        <span className="rounded-full bg-neutral-900 px-2.5 py-1 text-[10px] text-white">
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
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-neutral-50"
    >
      {/* drifting columns, blurred */}
      <div className="absolute inset-0 flex justify-center gap-5 opacity-60 blur-[3px] sm:gap-7">
        <Column cards={colA} duration={34} />
        <Column cards={colB} duration={42} delay={-6} />
        <Column cards={colC} duration={30} delay={-12} />
        <Column cards={colD} duration={46} delay={-3} />
        <Column cards={colE} duration={38} delay={-9} />
      </div>

      {/* white wash so the foreground login card stays readable */}
      <div className="absolute inset-0 bg-white/55" />
      {/* soft radial focus behind the centered card */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(420px circle at 50% 45%, rgba(255,255,255,0.85), transparent 70%)',
        }}
      />
    </div>
  );
}
