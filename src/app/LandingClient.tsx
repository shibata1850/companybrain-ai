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
      <CommunicationGap />
      <BeforeAfter />
      <Impact />
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
  /** Icon used on the persona avatar tile. */
  icon: keyof typeof ICONS;
  /** Gradient accent for the avatar tile. */
  accent: string;
  bio: string;
  /** Opening line the brain says in its own voice. */
  greeting: string;
  qa: { q: string; a: string }[];
};

const DEMO_PERSONAS: DemoPersona[] = [
  {
    id: 'accounting',
    name: '経理ヘルプデスク',
    icon: 'briefcase',
    accent: 'from-indigo-500 to-violet-600',
    bio: '経理部の規程に詳しい仮想アシスタント',
    greeting: 'こんにちは。経理部の規程に詳しい仮想アシスタントです。',
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
    icon: 'chart',
    accent: 'from-rose-500 to-orange-500',
    bio: '営業部長の口調と知識を学んだブレイン',
    greeting: 'どうも、営業部長の口調と知識を学んだブレインだ。',
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
    icon: 'code',
    accent: 'from-emerald-500 to-teal-600',
    bio: '社内コード規約・設計判断のレビュアー',
    greeting: 'こんにちは。社内コード規約・設計判断のレビュアーです。',
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
  {
    id: 'civil',
    name: '土木施工管理ベテラン',
    icon: 'hardhat',
    accent: 'from-amber-500 to-orange-600',
    bio: '公共工事の積算・工程・安全をさばく現場監督',
    greeting: '公共工事の現場を30年見てきた監督だ。積算・工程・安全、判断に迷ったら下から聞いてくれ。',
    qa: [
      {
        q: '凍上対策、どこまでやれば足りる?',
        a: '岩手で凍上を甘く見ると、春先に舗装が割れて手戻りになる。まず設計凍結指数から凍結深さを出す。路床がシルト分の多い凍上しやすい土なら、凍結深さまでを非凍上性材料に置換するのが基本線だ。置換が深くて不経済なら断熱工法で凍結を遮る手もある。ただし地下水位が高い現場は、排水を先に切らないと何を敷いても効かない。発注図の凍結深さを鵜呑みにせず、地下水と路床のシルト分は自分の目で確認してくれ。',
      },
      {
        q: '工程が10日遅れた。どう巻き返す?',
        a: '最初にやるのは「遅れが一過性か構造的か」の切り分けだ。天候や材料待ちの一過性なら、クリティカルパス上の作業だけ夜間・休日でリカバリーする。設計変更や用地が原因の構造的な遅れなら、巻き返しではなく工期延期の協議に切り替える。無理な突貫は事故と品質低下で結局高くつく。発注者協議用に、遅延の事実・原因・対策・変更後工程を一枚にまとめて先に出すこと。後出しは信頼を失う。',
      },
      {
        q: '総合評価落札方式、加点はどこで稼ぐ?',
        a: '配点の大きいところから取りに行く。多くの案件で効くのは、企業の同種工事実績・配置技術者の経験・地域貢献(災害協定、除雪、ボランティア)だ。技術提案型なら、現場固有のリスク(近接構造物・交通・環境)への対策を、一般論でなく数字と手順で書けるかで差がつく。実績調書と技術者経歴は普段から整理しておくこと。公告後に揃えるのでは間に合わない。',
      },
    ],
  },
  {
    id: 'architecture',
    name: '建築施工管理ベテラン',
    icon: 'building',
    accent: 'from-sky-500 to-blue-600',
    bio: '寒冷地の住宅・非住宅を回す現場代理人',
    greeting: '寒冷地の建築現場を仕切ってきた代理人だ。納まり・工程・施主対応、判断材料が要るなら聞いてくれ。',
    qa: [
      {
        q: '寒冷地の断熱、等級はどこまで狙う?',
        a: '岩手なら断熱等性能等級は最低でも等級6、補助金や光熱費を本気で取りに行くなら等級7を検討する。ただし等級を上げるほど開口部とサッシのコストが跳ね、施工精度の要求も上がる。気密(C値)が伴わない高断熱は結露と性能未達を招くので、断熱等級だけ上げて気密測定をしない設計は止めたほうがいい。施主には初期コストと年間光熱費の差を「何年で回収できるか」で示して判断してもらう。',
      },
      {
        q: '鉄骨建方、強風で止める基準は?',
        a: '一般には平均風速10m/s以上で建方は中止が目安、瞬間風速はそれ以下でも危険だ。岩手は冬から春の季節風と山間部の吹き下ろしで現場差が大きい。クレーンはメーカーの作業範囲風速も併せて確認する。「もう少しで終わるから」が一番危ない。中止判断は現場代理人が単独で即断できるルールにしておき、迷ったら止める。人が落ちてからでは遅い。',
      },
      {
        q: '施主の追加要望、どう線を引く?',
        a: '「できる/できない」で答える前に、「契約に含まれる/含まれない」を先に切り分ける。含まれない要望は、必ず追加費用と工期影響を書面(変更見積)にして、口頭で進めない。良かれと思ってサービスで飲むと、次も無償が前提になり、最後は赤字と不満が同時に残る。断るのではなく「やります、ただし金額と工期はこうなります」と数字で返すのが、施主にとっても誠実だ。',
      },
    ],
  },
  {
    id: 'manufacturing',
    name: '生産管理・品質リーダー',
    icon: 'gauge',
    accent: 'from-slate-500 to-blue-600',
    bio: '自動車・半導体サプライヤーの工程改善と品質保証を仕切る',
    greeting: '自動車・半導体の二次三次サプライヤーで品質と生産管理を見てきた。現場の困りごとを聞かせてくれ。',
    qa: [
      {
        q: '不良率が下がらない。何から手をつける?',
        a: 'まず「どの工程で、どの不良が、いつ出ているか」を層別する。これをやらずに対策を打つから効かない。パレート図で上位2〜3の不良に絞り、その工程の4M(人・機械・材料・方法)のどれが変動しているかを特定する。発生原因と流出原因は分けて潰す——「なぜ作ったか」と「なぜ気づかず流したか」は別の問題だ。クレーム対応に追われている時ほど、データを取る時間を先に確保しないと火消しが永遠に続く。',
      },
      {
        q: '客先監査の前、どこを固める?',
        a: '監査員が必ず見るのは、変更管理・不適合品の処置・記録のトレーサビリティの3点だ。工程変更が4M変更管理票に残っているか、不良品の隔離と再発防止が記録で追えるか、ロットから現品まで遡れるか。現場が綺麗でも紙が揃っていなければ評価は下がる。逆に、前回指摘への是正が確実に閉じていれば印象は良い。まず前回監査の指摘リストを開いて、未完了がないか確認するところから始めてくれ。',
      },
      {
        q: '多能工化、どう進める?',
        a: 'スキルマップで「誰が何の工程をどこまでできるか」を可視化するところからだ。属人化している工程ほど、その人が休むと止まる=最優先の教育対象になる。一気に全員を多能工にしようとすると現場が混乱するので、まずはボトルネック工程を2人以上で回せる状態を目標にする。標準作業手順書(SOP)が無いまま教育すると人によって品質がブレるので、教える前に手順を一枚にする。',
      },
    ],
  },
  {
    id: 'care',
    name: '介護現場リーダー',
    icon: 'heart',
    accent: 'from-pink-500 to-rose-600',
    bio: '介護保険の制度と現場運営の両方が分かる相談員',
    greeting: '介護保険制度と現場の両方を見てきた相談員だ。加算・記録・人の問題、何でも聞いてくれ。',
    qa: [
      {
        q: 'この加算、算定要件を満たしてる?',
        a: '加算は「体制要件」と「記録・実施要件」の両方が揃って初めて算定できる。職員配置や研修の体制が整っていても、計画書・実施記録・同意の書面が揃っていないと、実地指導で返還になる。「やっているのに記録が無い」は、制度上は「やっていない」と同じ扱いだ。算定前に、要件のチェックリストと根拠書類の保管場所を必ず確認してくれ。具体的な加算名を教えてくれれば、要件を一つずつ照らす。(※最終的な算定可否は最新の運営基準と保険者の解釈で変わる。判断は保険者・国保連に確認すること)',
      },
      {
        q: '家族からのクレーム、初動はどうする?',
        a: '初動は「事実確認の前に、まず話を最後まで聴く」だ。反論や説明を先に出すと、事実が正しくても関係が壊れる。聴いた上で、事実と要望を分けて記録し、いつまでに誰が何を回答するかを明確にする。その場で約束できないことは約束しない。曖昧な「善処します」が次のクレームを生む。記録は後日の説明責任のためにも必ず残す。',
      },
      {
        q: '新人が3ヶ月で辞める。何が原因?',
        a: '多くは「教える人と手順が決まっていない」ことが原因だ。日によって教える人が違い、言うことが違うと、新人は何が正解か分からず自信を失う。OJT担当を固定し、最初の3ヶ月で覚える項目を順番に並べたチェックリストを渡す。加えて週1回でいいので「困っていること」を聞く場を作る。辞める人はたいてい辞める前に小さなサインを出している。給与より先に、人間関係と「できる感覚」を作れているかを見てくれ。',
      },
    ],
  },
  {
    id: 'agriculture',
    name: '営農指導・農業経営',
    icon: 'leaf',
    accent: 'from-lime-500 to-green-600',
    bio: '補助金・栽培・経営をまとめて見る営農指導員',
    greeting: '岩手の農業現場で営農指導をしてきた。補助金・栽培・経営、どこからでも聞いてくれ。',
    qa: [
      {
        q: 'この補助金、うちは対象になる?',
        a: '補助金は「対象者要件」「対象経費」「事業期間」の3点で落ちることが多い。認定農業者か、経営規模、青色申告の有無で対象が変わる制度が多いので、まず自分がどの区分かを確認する。対象経費も、機械は対象でも中古は対象外、といった細かい線引きがある。発注や契約を交付決定の前にやると、それだけで全額対象外になる——これが一番多い失敗だ。補助金名と御社の経営区分を教えてくれれば、対象になりそうかを一緒に見る。(※最終的な対象可否は公募要領と窓口の判断による)',
      },
      {
        q: '米価が下がった。経営をどう守る?',
        a: '短期と中期を分ける。短期は、収入減少を補う制度(収入保険・ナラシ対策など)に入っているかの確認が先だ。入っていないなら来年の作付け前に検討する。中期は、米単一からの分散——飼料用米・転作作物・直販比率の引き上げで価格変動の影響を薄める。一番危ないのは、価格が戻ることに賭けて何も変えないことだ。まず10a当たり生産コストを出すところから始めよう。それが分からないと、いくらで赤字かも判断できない。',
      },
      {
        q: '新規就農、初年度に何を揃える?',
        a: '機械より先に「販路」と「資金繰り」だ。作っても売り先が無ければ在庫が腐るだけだし、初年度は収入が入る前に支出が先行する。就農前に、支援制度(農業次世代人材投資資金など)の対象になるか、市町村・普及センターに必ず相談する。機械を新品で揃えると一気に資金が枯れるので、中古・リース・近隣農家との共同利用から始める。最初の1年は「儲ける」より「続けられる資金繰りを作る」ことを目標にしてくれ。',
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
        <div className="mt-12 grid gap-5 lg:grid-cols-[280px_1fr]">
          {/* Persona tabs: horizontal swipe strip on mobile (8 personas
              would push the chat far below the fold), vertical list on
              desktop. */}
          <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
            {DEMO_PERSONAS.map((p) => {
              const active = p.id === personaId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPersonaId(p.id)}
                  className={`flex w-64 shrink-0 items-center gap-3 rounded-2xl border p-3 text-left transition lg:w-full ${
                    active
                      ? 'border-neutral-900 bg-white shadow-sm'
                      : 'border-neutral-200 bg-white hover:border-neutral-400'
                  }`}
                >
                  <span
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${p.accent} text-white shadow-md`}
                  >
                    {(() => {
                      const Icon = ICONS[p.icon];
                      return <Icon />;
                    })()}
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
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br ${persona.accent} text-white shadow`}
                  >
                    {(() => {
                      const Icon = ICONS[persona.icon];
                      return <Icon />;
                    })()}
                  </span>
                  <div className="max-w-[80%] rounded-2xl rounded-tl-md bg-neutral-100 px-3.5 py-2 text-sm text-neutral-800">
                    {persona.greeting} 下から質問を選んでみてください。
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
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br ${persona.accent} text-white shadow`}
                      >
                        {(() => {
                          const Icon = ICONS[persona.icon];
                          return <Icon />;
                        })()}
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
  /* Industry icons for the Use Cases section. */
  construction: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3.5 17.5h17M5.5 17.5v-5.5a6.5 6.5 0 0 1 13 0v5.5M12 5.5V3" />
    </svg>
  ),
  scale: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v18M5 21h14M3 7h18" />
      <path d="M7 7l-3 6h6zM17 7l-3 6h6z" />
    </svg>
  ),
  factory: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 21V10l5 3v-3l5 3v-3l5 3v8z" />
      <path d="M9 17h1M14 17h1" />
    </svg>
  ),
  medical: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  ),
  truck: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2.5 16.5V6h11v10.5M13.5 9.5h4l3 4v3h-7" />
      <circle cx="7" cy="18.5" r="1.8" />
      <circle cx="17" cy="18.5" r="1.8" />
    </svg>
  ),
  bag: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4.5 8h15l-1.2 12a2 2 0 0 1-2 1.8H7.7a2 2 0 0 1-2-1.8z" />
      <path d="M8.5 8V5.5a3.5 3.5 0 0 1 7 0V8" />
    </svg>
  ),
  /* Persona icons for the demo personas. */
  briefcase: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="7" width="18" height="13" rx="2.5" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18" />
    </svg>
  ),
  chart: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 20h18M5 20V12M10 20V8M15 20v-6M20 20V4" />
    </svg>
  ),
  code: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 8l-5 4 5 4M15 8l5 4-5 4M13 6l-2 12" />
    </svg>
  ),
  hardhat: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 16v-2a8 8 0 0 1 5-7.4V10M20 16v-2a8 8 0 0 0-5-7.4V10" />
      <path d="M9 6.6V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v1.6" />
      <path d="M2.5 16h19v2.5a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1z" />
    </svg>
  ),
  building: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4.5 21V4.5A1.5 1.5 0 0 1 6 3h8a1.5 1.5 0 0 1 1.5 1.5V21M15.5 9H18a1.5 1.5 0 0 1 1.5 1.5V21M2.5 21h19" />
      <path d="M8 7h1.5M11 7h1.5M8 10.5h1.5M11 10.5h1.5M8 14h1.5M11 14h1.5M9.5 21v-3.5h2V21" />
    </svg>
  ),
  gauge: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4.5 19a9 9 0 1 1 15 0" />
      <path d="M12 14l4-5" />
      <circle cx="12" cy="14.5" r="1.6" />
    </svg>
  ),
  heart: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20.5S3.5 15.5 3.5 9.3A4.6 4.6 0 0 1 8 4.5c1.7 0 3.2.9 4 2.3a4.7 4.7 0 0 1 4-2.3 4.6 4.6 0 0 1 4.5 4.8c0 6.2-8.5 11.2-8.5 11.2z" />
    </svg>
  ),
  leaf: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 19c0-8 5-14 14-14 0 9-5 14-12 14" />
      <path d="M5 19c3-5 7-8 11-9.5" />
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
    { done: true, label: '音声を文字起こし', detail: '発言をすべてテキスト化' },
    { done: true, label: '発言を意味で分割', detail: '152 チャンク生成' },
    { done: true, label: 'ベクトル化して保存', detail: 'pgvector に 152 件登録' },
    { done: true, label: '人格プロファイル完成', detail: '口調・価値観・話し方を抽出済み' },
  ];
  return (
    <div className="grid gap-5 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm md:grid-cols-[1.1fr_1fr]">
      <div>
        {/* 疑似サムネイル: 実動画は無いので、研修動画の静止画風の
            ラインアート + 再生ボタンで「動画プレイヤー」を表現する。 */}
        <div className="relative overflow-hidden rounded-xl border border-neutral-200 bg-gradient-to-br from-neutral-50 to-neutral-200">
          <div className="relative aspect-video">
            <svg
              viewBox="0 0 320 180"
              className="absolute inset-0 h-full w-full text-neutral-700"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              {/* whiteboard behind the presenter */}
              <rect x="168" y="28" width="128" height="86" rx="4" fill="white" />
              <path d="M184 46h64M184 60h96M184 74h84M184 88h52" strokeWidth="1.8" opacity="0.4" />
              {/* presenter bust, waist-up and cut by the frame bottom —
                  same head + shoulder-curve language as the LP avatars.
                  The shoulder apex (y=120) meets the head bottom (y=119)
                  so the figure reads as one connected silhouette. */}
              <path
                d="M50 180C58 136 78 120 100 120S142 136 150 180"
                fill="white"
              />
              <circle cx="100" cy="94" r="25" fill="white" />
            </svg>
            {/* play button */}
            <span className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white shadow-lg ring-1 ring-black/5">
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
                <path d="M8 5.5l11 6.5-11 6.5z" fill="#171717" />
              </svg>
            </span>
            {/* filename bar */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-3.5 pb-2.5 pt-6 text-white">
              <p className="truncate text-xs font-medium">
                田中部長_社内研修.mp4
              </p>
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
  const steps: {
    n: number;
    title: string;
    body: React.ReactNode;
    point: string;
    art: () => JSX.Element;
  }[] = [
    {
      n: 1,
      title: 'ブレインを作る',
      body: (
        <>
          名前を決めて、人物の動画と社内資料をアップロード。
          <br className="hidden md:inline" />
          素材はあとから追加もできます。
        </>
      ),
      point: '動画+資料で、あなただけの AI を構築',
      art: StepArtCreate,
    },
    {
      n: 2,
      title: '質問する',
      body: (
        <>
          チャットで聞いてもよし、
          <br className="hidden md:inline" />
          ボタンで音声会話してもよし。
        </>
      ),
      point: 'AI が社内の知識をもとに即回答',
      art: StepArtAsk,
    },
    {
      n: 3,
      title: 'チームに渡す',
      body: (
        <>
          完成したブレインは「依頼ワークフロー」で
          <br className="hidden md:inline" />
          同僚に譲渡。組織知が個人を越えて残る。
        </>
      ),
      point: 'チーム全体の知識資産として活用',
      art: StepArtShare,
    },
  ];
  return (
    <section className="lp-sect-soft py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading eyebrow="HOW IT WORKS" title="3 ステップで導入。" />
        <div className="mt-12 flex flex-col items-stretch gap-4 md:flex-row md:items-center">
          {steps.map((s, i) => {
            const Art = s.art;
            return (
              <div key={s.n} className="contents">
                {i > 0 && (
                  <div
                    aria-hidden
                    className="flex items-center justify-center text-neutral-400"
                  >
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="rotate-90 md:rotate-0"
                    >
                      <path d="M4 12h16M14 6l6 6-6 6" />
                    </svg>
                  </div>
                )}
                <div className="flex flex-1 flex-col rounded-2xl border border-neutral-200 bg-white p-6">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-neutral-900 text-xs font-semibold text-white">
                      {s.n}
                    </span>
                    <h3 className="text-base font-semibold tracking-tight">
                      {s.title}
                    </h3>
                  </div>
                  <div className="mt-5 flex h-36 items-center justify-center text-neutral-800">
                    <Art />
                  </div>
                  <p className="mt-5 flex-1 text-sm leading-relaxed text-neutral-600">
                    {s.body}
                  </p>
                  <div className="mt-4 inline-flex items-center gap-2 self-start rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[11px] font-medium text-neutral-700">
                    <span className="grid h-4 w-4 place-items-center rounded-full bg-neutral-900 text-white">
                      <svg width="9" height="9" viewBox="0 0 16 16" aria-hidden>
                        <path
                          d="M3 8.5l3 3L13 5"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                        />
                      </svg>
                    </span>
                    {s.point}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* Monochrome line-art illustrations for the three onboarding steps.
   Same stroke language as ICONS (currentColor, round caps) so they sit
   naturally in the neutral LP palette. */

function StepArtCreate() {
  return (
    <svg width="190" height="130" viewBox="0 0 190 130" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {/* laptop */}
      <rect x="18" y="26" width="92" height="62" rx="5" />
      {/* person thumbnail on screen */}
      <rect x="27" y="35" width="42" height="44" rx="3" fill="rgba(0,0,0,0.05)" />
      <circle cx="48" cy="50" r="7" />
      <path d="M36 74c2.5-8 9-11 12-11s9.5 3 12 11" />
      {/* play marks */}
      <path d="M76 42l7 4-7 4zM76 58h24M76 66h18" strokeWidth="1.8" />
      {/* keyboard base */}
      <path d="M10 88h108l-8 12H18z" />
      {/* upload arrow */}
      <circle cx="124" cy="66" r="12" fill="white" />
      <path d="M124 72v-11M119.5 65.5l4.5-4.5 4.5 4.5" />
      {/* floating docs */}
      <rect x="146" y="14" width="30" height="24" rx="3" />
      <path d="M152 21h18M152 27h12" strokeWidth="1.6" />
      <rect x="152" y="52" width="30" height="24" rx="3" />
      <path d="M158 59h18M158 65h12" strokeWidth="1.6" />
      <rect x="146" y="90" width="30" height="24" rx="3" />
      <path d="M152 97h18M152 103h12" strokeWidth="1.6" />
      <path d="M143 26c-4 1-6 3-7 6M149 64h-7M143 102c-4-1-6-3-7-6" strokeWidth="1.6" strokeDasharray="3 4" />
    </svg>
  );
}

function StepArtAsk() {
  return (
    <svg width="190" height="130" viewBox="0 0 190 130" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {/* person */}
      <circle cx="38" cy="62" r="13" />
      <path d="M16 116c3-18 13-26 22-26s19 8 22 26" />
      {/* question bubble */}
      <path d="M20 18h26a7 7 0 0 1 7 7v10a7 7 0 0 1-7 7h-8l-7 8v-8h-11a7 7 0 0 1-7-7V25a7 7 0 0 1 7-7z" />
      <path d="M30 25c1-2.5 3-3.5 5-3.5 2.6 0 4.8 1.7 4.8 4.2 0 3-4 3.3-4 6.3M35.8 36.5v.4" strokeWidth="1.8" />
      {/* chat window */}
      <rect x="88" y="20" width="90" height="90" rx="8" />
      <path d="M88 36h90" strokeWidth="1.6" />
      <circle cx="97" cy="28" r="1.6" fill="currentColor" strokeWidth="0" />
      <circle cx="104" cy="28" r="1.6" fill="currentColor" strokeWidth="0" />
      <circle cx="111" cy="28" r="1.6" fill="currentColor" strokeWidth="0" />
      {/* Q row */}
      <rect x="96" y="44" width="52" height="18" rx="6" fill="rgba(0,0,0,0.05)" />
      <path d="M103 53h1M110 53h32" strokeWidth="1.8" />
      <text x="101" y="57" fontSize="11" fontWeight="bold" stroke="none" fill="currentColor">Q</text>
      {/* A row */}
      <rect x="112" y="70" width="58" height="26" rx="6" fill="rgba(0,0,0,0.05)" />
      <text x="118" y="83" fontSize="11" fontWeight="bold" stroke="none" fill="currentColor">A</text>
      <path d="M128 79h34M128 87h26" strokeWidth="1.8" />
    </svg>
  );
}

function StepArtShare() {
  return (
    <svg width="190" height="130" viewBox="0 0 190 130" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {/* connection lines */}
      <path d="M74 46L38 26M116 46l36-20M74 84l-36 20M116 84l36 20" strokeWidth="1.6" strokeDasharray="3 4" />
      {/* central brain card */}
      <rect x="65" y="35" width="60" height="60" rx="8" fill="white" />
      <circle cx="95" cy="57" r="9" />
      <path d="M80 88c2-10 9-14 15-14s13 4 15 14" />
      {/* verified badge */}
      <circle cx="121" cy="88" r="10" fill="white" />
      <path d="M116.5 88l3 3 5.5-6" />
      {/* four teammates */}
      <circle cx="30" cy="20" r="11" fill="white" />
      <circle cx="30" cy="17" r="4" />
      <path d="M23 27c1.5-4 4.5-5.5 7-5.5s5.5 1.5 7 5.5" strokeWidth="1.8" />
      <circle cx="160" cy="20" r="11" fill="white" />
      <circle cx="160" cy="17" r="4" />
      <path d="M153 27c1.5-4 4.5-5.5 7-5.5s5.5 1.5 7 5.5" strokeWidth="1.8" />
      <circle cx="30" cy="110" r="11" fill="white" />
      <circle cx="30" cy="107" r="4" />
      <path d="M23 117c1.5-4 4.5-5.5 7-5.5s5.5 1.5 7 5.5" strokeWidth="1.8" />
      <circle cx="160" cy="110" r="11" fill="white" />
      <circle cx="160" cy="107" r="4" />
      <path d="M153 117c1.5-4 4.5-5.5 7-5.5s5.5 1.5 7 5.5" strokeWidth="1.8" />
    </svg>
  );
}

/* ===================================================================
   USE CASES
   =================================================================== */

function UseCases() {
  const cases: {
    icon: keyof typeof ICONS;
    title: string;
    body: string;
    accent: string;
  }[] = [
    {
      icon: 'construction',
      title: '建設業',
      body: '建築基準法・社内安全規程・現場マニュアルを学習。新人が「あの規定どこ?」と聞かなくていい。',
      accent: 'from-orange-500 to-amber-500',
    },
    {
      icon: 'scale',
      title: '士業事務所',
      body: '判例・税法・規程を所長の口調で。お客様への一次回答を AI が下書き。',
      accent: 'from-emerald-500 to-teal-600',
    },
    {
      icon: 'factory',
      title: '製造業',
      body: '機械別の保守マニュアル・トラブル事例を蓄積。属人化していた知見を残す。',
      accent: 'from-slate-500 to-blue-600',
    },
    {
      icon: 'medical',
      title: '医療・介護',
      body: '院内ルール・薬剤情報・引き継ぎノート。夜勤帯の問い合わせを削減。',
      accent: 'from-rose-500 to-pink-600',
    },
    {
      icon: 'truck',
      title: '物流・運送',
      body: '配車ルール・輸送規程・取引先別の特記事項を瞬時に照会。',
      accent: 'from-yellow-500 to-orange-500',
    },
    {
      icon: 'bag',
      title: '小売・EC',
      body: '商品 FAQ・返品ルール・店舗別の運用差異。カスタマーサポートを支援。',
      accent: 'from-violet-500 to-fuchsia-600',
    },
  ];
  return (
    <section className="lp-sect-light py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="USE CASES"
          title="業種を問わず、社内ナレッジは「人」に紐付いている。"
          subtitle="ベテランの頭の中を、辞めても残る形に。"
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cases.map((c) => {
            const Icon = ICONS[c.icon];
            return (
              <div
                key={c.title}
                className="group relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-6 transition duration-300 hover:-translate-y-1 hover:border-transparent hover:shadow-2xl"
              >
                <div
                  aria-hidden
                  className={`pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br ${c.accent} opacity-0 blur-2xl transition duration-500 group-hover:opacity-20`}
                />
                <div
                  aria-hidden
                  className={`absolute inset-x-0 top-0 h-1 origin-left scale-x-0 bg-gradient-to-r ${c.accent} transition-transform duration-300 group-hover:scale-x-100`}
                />
                <div
                  className={`grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br ${c.accent} text-white shadow-lg transition duration-300 group-hover:scale-110 group-hover:-rotate-3`}
                >
                  <Icon />
                </div>
                <h3 className="mt-5 text-lg font-semibold tracking-tight">
                  {c.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                  {c.body}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ===================================================================
   COMMUNICATION GAP — 経営者と若手の「本音のズレ」を時代背景で整理
   =================================================================== */

type GapRow = {
  boss: { quote: string; caption: string };
  era: { from: string; to: string; icons: [() => JSX.Element, () => JSX.Element] };
  young: { quote: string; caption: string };
};

function CommunicationGap() {
  const rows: GapRow[] = [
    {
      boss: {
        quote: '“まずは現場で見て覚えてほしい”',
        caption: '自分たちも、そうやって育ってきた。',
      },
      era: {
        from: '経験で学ぶ時代',
        to: 'すぐ検索・すぐ確認できる時代',
        icons: [GapIconPerson, GapIconSearch],
      },
      young: {
        quote: '“最初に全体像と正解を知りたい”',
        caption: '基準やゴールが分からないと動きにくい。',
      },
    },
    {
      boss: {
        quote: '“長く働くのは、責任感の表れだ”',
        caption: '忙しいことも頑張りの証だった。',
      },
      era: {
        from: '長時間労働が評価された時代',
        to: '生産性・効率が重視される時代',
        icons: [GapIconClock, GapIconChart],
      },
      young: {
        quote: '“長さより、成果で評価してほしい”',
        caption: 'ムダな作業や会議に違和感を持ちやすい。',
      },
    },
    {
      boss: {
        quote: '“会社に尽くし、長く続けてほしい”',
        caption: '辞めずに続けることが信頼につながった。',
      },
      era: {
        from: '終身雇用・年功序列の時代',
        to: 'キャリア自律・転職が一般化した時代',
        icons: [GapIconBuilding, GapIconClimb],
      },
      young: {
        quote: '“成長できる環境で働きたい”',
        caption: '納得できなければ転職も普通の選択肢。',
      },
    },
  ];

  const cores = [
    { n: 1, text: '言葉の意味が、世代で違う', icon: GapIconSpeech },
    { n: 2, text: '成功体験の前提が、すでに違う', icon: GapIconTarget },
    { n: 3, text: '期待値が共有されないと、すれ違いが深くなる', icon: GapIconPeople },
  ];

  return (
    <section className="lp-sect-soft py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="COMMUNICATION GAP"
          title="本音のズレは、時代の違いから生まれる。"
          subtitle="地方企業で起こりがちな、経営者・上司と若手社員のすれ違いを、時代背景とあわせて整理。"
        />

        {/* Column headers (desktop only — mobile shows per-card labels) */}
        <div className="mt-12 hidden grid-cols-[1.1fr_1fr_1.1fr] gap-4 md:grid">
          <div className="text-center">
            <span className="inline-block rounded-full bg-neutral-900 px-4 py-1.5 text-xs font-semibold text-white">
              経営者・上司の言い分
            </span>
          </div>
          <div className="text-center">
            <span className="inline-block rounded-full border border-neutral-300 bg-white px-4 py-1.5 text-xs font-semibold text-neutral-700">
              時代の違い
            </span>
          </div>
          <div className="text-center">
            <span className="inline-block rounded-full bg-neutral-900 px-4 py-1.5 text-xs font-semibold text-white">
              若手社員の言い分
            </span>
          </div>
        </div>

        <div className="mt-4 space-y-4 md:mt-5">
          {rows.map((r, i) => {
            const [IconFrom, IconTo] = r.era.icons;
            return (
              <div
                key={i}
                className="grid gap-3 md:grid-cols-[1.1fr_1fr_1.1fr] md:gap-4"
              >
                {/* boss */}
                <div className="flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-5">
                  <span className="shrink-0 text-neutral-800">
                    <GapAvatarBoss />
                  </span>
                  <div className="min-w-0">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 md:hidden">
                      経営者・上司の言い分
                    </p>
                    <p className="text-sm font-semibold leading-snug text-neutral-900">
                      {r.boss.quote}
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed text-neutral-500">
                      {r.boss.caption}
                    </p>
                  </div>
                </div>
                {/* era shift */}
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-white/60 p-5 text-center">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 md:hidden">
                    時代の違い
                  </p>
                  <div className="flex items-center gap-3 text-neutral-700">
                    <IconFrom />
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M4 12h16M14 6l6 6-6 6" />
                    </svg>
                    <IconTo />
                  </div>
                  <p className="mt-2.5 text-xs leading-relaxed text-neutral-600">
                    {r.era.from}
                    <br />
                    <span className="text-neutral-400">↓</span>
                    <br />
                    <span className="font-medium text-neutral-800">{r.era.to}</span>
                  </p>
                </div>
                {/* young */}
                <div className="flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-5 md:flex-row-reverse md:text-right">
                  <span className="shrink-0 text-neutral-800">
                    <GapAvatarYoung />
                  </span>
                  <div className="min-w-0">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 md:hidden">
                      若手社員の言い分
                    </p>
                    <p className="text-sm font-semibold leading-snug text-neutral-900">
                      {r.young.quote}
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed text-neutral-500">
                      {r.young.caption}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ズレの核心 */}
        <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-5 md:flex-row md:items-center">
          <p className="shrink-0 text-sm font-bold text-neutral-900 md:border-r md:border-neutral-200 md:pr-5">
            ズレの核心
          </p>
          <div className="grid flex-1 gap-3 sm:grid-cols-3">
            {cores.map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.n} className="flex items-start gap-2.5">
                  <span className="mt-0.5 shrink-0 text-neutral-700">
                    <Icon />
                  </span>
                  <p className="text-xs leading-relaxed text-neutral-700">
                    <span className="font-semibold text-neutral-900">{c.n}. </span>
                    {c.text}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* conclusion */}
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-neutral-900 bg-neutral-900 p-5 text-white">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/40">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 12h16M14 6l6 6-6 6" />
            </svg>
          </span>
          <p className="text-sm font-medium leading-relaxed">
            だからこそ、経営者の考え・判断基準・言葉を残し、若手がいつでも確認できる仕組みが必要です。
          </p>
        </div>
      </div>
    </section>
  );
}

/* Small line-art icons + avatars for the CommunicationGap section. */

function GapAvatarBoss() {
  return (
    <svg width="52" height="52" viewBox="0 0 56 56" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="28" cy="18" r="9" />
      {/* glasses */}
      <path d="M21 17.5h5M30 17.5h5M26 17.5h4" strokeWidth="1.5" />
      <path d="M10 50c2.5-13 10-18 18-18s15.5 5 18 18" />
      {/* tie */}
      <path d="M28 34v10" strokeWidth="1.7" />
    </svg>
  );
}

function GapAvatarYoung() {
  return (
    <svg width="52" height="52" viewBox="0 0 56 56" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="28" cy="18" r="9" />
      {/* fringe */}
      <path d="M20 15c2-4 6-6 8-6s6 2 8 6" strokeWidth="1.5" />
      <path d="M10 50c2.5-13 10-18 18-18s15.5 5 18 18" />
    </svg>
  );
}

function GapIconPerson() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 20c1.5-5 4.5-7 7-7s5.5 2 7 7" />
    </svg>
  );
}

function GapIconSearch() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2.5" y="4" width="19" height="14" rx="2" />
      <path d="M8 21h8" />
      <circle cx="11" cy="10.5" r="3" />
      <path d="M13.2 12.7l2.8 2.8" />
    </svg>
  );
}

function GapIconClock() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2.5" />
    </svg>
  );
}

function GapIconChart() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 21h18" />
      <path d="M6 21v-6M11 21V9M16 21v-4M21 21V4" />
    </svg>
  );
}

function GapIconBuilding() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="6" y="3" width="12" height="18" rx="1.5" />
      <path d="M10 7h1.5M13 7h1.5M10 11h1.5M13 11h1.5M10 15h1.5M13 15h1.5M3 21h18" />
    </svg>
  );
}

function GapIconClimb() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 21h5v-5h5v-5h5V6h3" />
      <path d="M18 3v3h3" strokeWidth="1.5" />
    </svg>
  );
}

function GapIconSpeech() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 5h16a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 20 16h-8l-5 5v-5H4a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 4 5z" />
      <path d="M7.5 9.5h9M7.5 12.5h6" strokeWidth="1.5" />
    </svg>
  );
}

function GapIconTarget() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" strokeWidth="0" />
    </svg>
  );
}

function GapIconPeople() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="8" cy="9" r="3.2" />
      <circle cx="16.5" cy="9" r="3.2" />
      <path d="M2.5 20c1-4 3.2-5.8 5.5-5.8S12.5 16 13.5 20M13 15.5c1-.8 2.2-1.3 3.5-1.3 2.3 0 4.5 1.8 5.5 5.8" />
    </svg>
  );
}

/* ===================================================================
   BEFORE / AFTER
   =================================================================== */

function BeforeAfter() {
  return (
    <section className="lp-sect-light py-24 sm:py-28">
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
   IMPACT — 導入効果を KGI・KPI・KSF で可視化
   =================================================================== */

function Impact() {
  return (
    <section className="lp-sect-soft py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="IMPACT"
          title="導入効果を、KGI・KPI・KSF で可視化。"
        />
        <div className="mx-auto mt-6 max-w-xl rounded-full border border-neutral-200 bg-white px-5 py-2 text-center text-xs text-neutral-600">
          <span className="font-semibold text-neutral-900">KGI</span> = 最終ゴール
          <span className="mx-2 text-neutral-300">/</span>
          <span className="font-semibold text-neutral-900">KPI</span> = 途中経過を見る数字
          <span className="mx-2 text-neutral-300">/</span>
          <span className="font-semibold text-neutral-900">KSF</span> = 成功のカギ
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {/* KGI */}
          <div className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-6">
            <span className="self-start rounded-full bg-neutral-900 px-3 py-1 text-[10px] font-semibold text-white">
              KGI → ゴール
            </span>
            <div className="mt-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-2xl font-bold tracking-tight text-neutral-900">
                  KGI
                </p>
                <p className="mt-0.5 text-sm font-semibold text-neutral-800">
                  最終的に目指す成果
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-neutral-500">
                  会社として最後に達成したいゴールです。
                </p>
              </div>
              <span className="shrink-0 text-neutral-800">
                <ImpactArtGoal />
              </span>
            </div>
            <div className="mt-5 grid flex-1 grid-cols-3 divide-x divide-neutral-200 border-t border-neutral-200 pt-4 text-center">
              <div className="px-1">
                <p className="text-[10px] text-neutral-500">ナレッジ継承率</p>
                <p className="mt-1 text-sm font-bold text-neutral-900">
                  90<span className="text-[10px] font-medium">%目標</span>
                </p>
              </div>
              <div className="px-1">
                <p className="text-[10px] text-neutral-500">新人立ち上がり</p>
                <p className="mt-1 text-sm font-bold text-neutral-900">
                  30<span className="text-[10px] font-medium">%短縮</span>
                </p>
              </div>
              <div className="px-1">
                <p className="text-[10px] text-neutral-500">対応品質の</p>
                <p className="mt-1 text-sm font-bold text-neutral-900">平準化</p>
              </div>
            </div>
          </div>

          {/* KPI */}
          <div className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-6">
            <span className="self-start rounded-full bg-neutral-900 px-3 py-1 text-[10px] font-semibold text-white">
              KPI → 途中確認
            </span>
            <div className="mt-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-2xl font-bold tracking-tight text-neutral-900">
                  KPI
                </p>
                <p className="mt-0.5 text-sm font-semibold text-neutral-800">
                  進み具合を測る数字
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-neutral-500">
                  ゴールに近づいているかを確認する指標です。
                </p>
              </div>
              <span className="shrink-0 text-neutral-800">
                <ImpactArtBars />
              </span>
            </div>
            <div className="mt-5 flex-1 space-y-3 border-t border-neutral-200 pt-4">
              <KpiRow label="一次解決率" before="42%" after="78%" />
              <KpiRow label="回答時間" before="15分" after="4分" />
              <KpiRow label="教育工数" before="月12h" after="5h" />
            </div>
          </div>

          {/* KSF */}
          <div className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-6">
            <span className="self-start rounded-full bg-neutral-900 px-3 py-1 text-[10px] font-semibold text-white">
              KSF → 成功条件
            </span>
            <div className="mt-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-2xl font-bold tracking-tight text-neutral-900">
                  KSF
                </p>
                <p className="mt-0.5 text-sm font-semibold text-neutral-800">
                  成功のために重要な要素
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-neutral-500">
                  成果を出すために、特に押さえるべきポイントです。
                </p>
              </div>
              <span className="shrink-0 text-neutral-800">
                <ImpactArtKey />
              </span>
            </div>
            <div className="mt-5 flex-1 space-y-2.5 border-t border-neutral-200 pt-4">
              {[
                '良質な人物動画と社内資料の整備',
                '現場で使いやすい質問導線の設計',
                '更新・共有ルールの定着',
              ].map((t) => (
                <div
                  key={t}
                  className="flex items-center gap-2.5 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5"
                >
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-neutral-900 text-white">
                    <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden>
                      <path
                        d="M3 8.5l3 3L13 5"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />
                    </svg>
                  </span>
                  <span className="text-xs font-medium text-neutral-800">{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.15fr]">
          {/* 効果が出る仕組み */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-6">
            <h3 className="text-base font-semibold tracking-tight text-neutral-900">
              効果が出る仕組み
            </h3>
            <div className="mt-6 flex items-start justify-between gap-1">
              {[
                { icon: FlowIconSource, l1: '人物動画・', l2: '社内資料' },
                { icon: FlowIconBrain, l1: 'ブレイン化', l2: '(AIが知識を整理)' },
                { icon: FlowIconQa, l1: '質問・回答', l2: '(いつでも確認)' },
                { icon: FlowIconTeam, l1: '共有・継承', l2: '(チームで活用)' },
              ].map((s, i, arr) => {
                const Icon = s.icon;
                return (
                  <div key={s.l1} className="contents">
                    <div className="flex min-w-0 flex-1 flex-col items-center text-center">
                      <span className="grid h-14 w-14 place-items-center rounded-full border border-neutral-300 bg-white text-neutral-800">
                        <Icon />
                      </span>
                      <p className="mt-2 text-[11px] font-medium leading-tight text-neutral-800">
                        {s.l1}
                        <br />
                        <span className="text-[10px] font-normal text-neutral-500">
                          {s.l2}
                        </span>
                      </p>
                    </div>
                    {i < arr.length - 1 && (
                      <span className="mt-5 shrink-0 text-neutral-400" aria-hidden>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 12h16M14 6l6 6-6 6" />
                        </svg>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-6 border-t border-neutral-100 pt-4 text-xs leading-relaxed text-neutral-600">
              知識を引き出し、整理し、誰でも使える形で残すことで、組織に残る流れをつくります。
            </p>
          </div>

          {/* 導入後の変化 */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-6">
            <h3 className="text-base font-semibold tracking-tight text-neutral-900">
              導入後の変化{' '}
              <span className="text-xs font-normal text-neutral-500">
                (イメージ)
              </span>
            </h3>
            <SelfSolveChart />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                <span className="text-neutral-800">
                  <GapIconClock />
                </span>
                <div>
                  <p className="text-[10px] text-neutral-500">月間削減時間</p>
                  <p className="text-lg font-bold tracking-tight text-neutral-900">
                    48<span className="text-xs font-semibold">h</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                <span className="text-neutral-800">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v9M8.5 12.5L12 16l3.5-3.5" />
                  </svg>
                </span>
                <div>
                  <p className="text-[10px] text-neutral-500">社内問い合わせ削減</p>
                  <p className="text-lg font-bold tracking-tight text-neutral-900">
                    57<span className="text-xs font-semibold">%</span>
                  </p>
                </div>
              </div>
            </div>
            <p className="mt-3 text-[10px] text-neutral-400">
              ※数値は導入イメージです。
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function KpiRow({
  label,
  before,
  after,
}: {
  label: string;
  before: string;
  after: string;
}) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-16 shrink-0 text-neutral-600">{label}</span>
      <span className="flex-1 text-right">
        <span className="font-semibold text-neutral-400">{before}</span>
        <span className="mx-1 block h-0.5 w-full rounded bg-neutral-200" aria-hidden />
      </span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-neutral-400" aria-hidden>
        <path d="M4 12h16M14 6l6 6-6 6" />
      </svg>
      <span className="flex-1">
        <span className="text-sm font-bold text-neutral-900">{after}</span>
        <span className="block h-1 w-full rounded bg-neutral-900" aria-hidden />
      </span>
    </div>
  );
}

/**
 * 自己解決率の推移(導入前 18% → 6ヶ月 76%)を描く静的な折れ線
 * チャート。LP のモノクロ言語に合わせて neutral のみで描画。
 */
function SelfSolveChart() {
  const points: { label: string; pct: number }[] = [
    { label: '導入前', pct: 18 },
    { label: '1ヶ月', pct: 41 },
    { label: '3ヶ月', pct: 63 },
    { label: '6ヶ月', pct: 76 },
  ];
  const W = 340;
  const H = 150;
  const padL = 34;
  const padR = 16;
  const top = 22;
  const bottom = 126;
  const xs = points.map(
    (_, i) => padL + ((W - padL - padR) * i) / (points.length - 1),
  );
  const y = (pct: number) => bottom - ((bottom - top) * pct) / 100;
  const line = points.map((p, i) => `${xs[i]},${y(p.pct)}`).join(' ');
  const area = `${padL},${bottom} ${line} ${xs[xs.length - 1]},${bottom}`;
  return (
    <div className="mt-3">
      <p className="flex items-center gap-1.5 text-[10px] text-neutral-500">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-neutral-900" />
        自己解決率
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-1 w-full"
        role="img"
        aria-label="自己解決率の推移: 導入前18%、1ヶ月41%、3ヶ月63%、6ヶ月76%"
      >
        {/* gridlines */}
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line
              x1={padL}
              x2={W - padR}
              y1={y(g)}
              y2={y(g)}
              stroke="rgba(0,0,0,0.07)"
              strokeWidth="1"
            />
            <text
              x={padL - 5}
              y={y(g) + 3}
              textAnchor="end"
              fontSize="8"
              fill="rgba(0,0,0,0.35)"
            >
              {g}%
            </text>
          </g>
        ))}
        {/* area + line */}
        <polygon points={area} fill="rgba(0,0,0,0.05)" />
        <polyline
          points={line}
          fill="none"
          stroke="#171717"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* points + value labels */}
        {points.map((p, i) => (
          <g key={p.label}>
            <circle cx={xs[i]} cy={y(p.pct)} r="3.5" fill="#171717" />
            <text
              x={xs[i]}
              y={y(p.pct) - 8}
              textAnchor="middle"
              fontSize="10"
              fontWeight="bold"
              fill="#171717"
            >
              {p.pct}%
            </text>
            <text
              x={xs[i]}
              y={H - 6}
              textAnchor="middle"
              fontSize="9"
              fill="rgba(0,0,0,0.45)"
            >
              {p.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/* Line-art spot icons for the Impact section. */

function ImpactArtGoal() {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="22" cy="30" r="13" />
      <circle cx="22" cy="30" r="7" />
      <circle cx="22" cy="30" r="1.8" fill="currentColor" strokeWidth="0" />
      <path d="M40 44V14M40 14h10l-3 5 3 5H40" />
      <path d="M8 48h44" strokeWidth="1.6" />
    </svg>
  );
}

function ImpactArtBars() {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 48h40" />
      <rect x="12" y="34" width="7" height="14" rx="1" />
      <rect x="22" y="26" width="7" height="22" rx="1" />
      <rect x="32" y="18" width="7" height="30" rx="1" fill="rgba(0,0,0,0.08)" />
      <rect x="42" y="10" width="7" height="38" rx="1" fill="rgba(0,0,0,0.15)" />
    </svg>
  );
}

function ImpactArtKey() {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="18" cy="20" r="9" />
      <circle cx="18" cy="20" r="3" />
      <path d="M24.5 26.5L40 42M34 36l-3.5 3.5M40 42l-3 3" />
      <circle cx="42" cy="18" r="7" strokeWidth="1.7" />
      <path d="M42 13.5v2M42 20.5v2M37.5 18h2M44.5 18h2" strokeWidth="1.5" />
    </svg>
  );
}

function FlowIconSource() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2.5" y="5" width="12" height="9" rx="1.5" />
      <path d="M7 9l3.5 2L7 13z" strokeWidth="1.5" />
      <path d="M14 10h5.5A1.5 1.5 0 0 1 21 11.5v8a1.5 1.5 0 0 1-1.5 1.5h-7a1.5 1.5 0 0 1-1.5-1.5V16" strokeWidth="1.6" />
    </svg>
  );
}

function FlowIconBrain() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9.5 4a3 3 0 0 0-3 3c-2 .5-3 2-3 4s1 3.5 3 4a3 3 0 0 0 3 3M14.5 4a3 3 0 0 1 3 3c2 .5 3 2 3 4s-1 3.5-3 4a3 3 0 0 1-3 3" />
      <path d="M12 4v16M9 9h-2M9 14h-2M17 9h-2M17 14h-2" strokeWidth="1.4" />
    </svg>
  );
}

function FlowIconQa() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 5h13a1.5 1.5 0 0 1 1.5 1.5V13a1.5 1.5 0 0 1-1.5 1.5H9L4.5 19v-4.5H3A1.5 1.5 0 0 1 1.5 13V6.5A1.5 1.5 0 0 1 3 5z" />
      <path d="M8.2 9.2c.3-1 1.1-1.4 1.9-1.4 1 0 1.9.7 1.9 1.7 0 1.2-1.7 1.3-1.7 2.5M10.3 14v.3" strokeWidth="1.5" />
      <path d="M20 9.5h1a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-.8V22l-3.5-3.5H14" strokeWidth="1.5" />
    </svg>
  );
}

function FlowIconTeam() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="7" r="3" />
      <path d="M7 20c.8-3.5 2.8-5.2 5-5.2s4.2 1.7 5 5.2" />
      <circle cx="4.5" cy="10" r="2.3" strokeWidth="1.5" />
      <circle cx="19.5" cy="10" r="2.3" strokeWidth="1.5" />
      <path d="M1.5 19c.5-2.5 1.8-3.8 3.4-4M22.5 19c-.5-2.5-1.8-3.8-3.4-4" strokeWidth="1.5" />
    </svg>
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
    { q: 'プラン変更や解約はいつでも可能ですか?', a: 'はい。ダッシュボードの「プラン変更」からいつでも申請できます。お支払いは請求書 / 銀行振込で、管理者が確認後にプランを切り替えます。' },
    { q: '動画はどのくらいのサイズまでアップロードできますか?', a: '1 ファイルあたり 50 MB までです(これとは別に、プランごとに素材の合計容量の上限があります)。長い動画は要点部分を切り出してアップロードすると、学習の精度も上がります。' },
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
