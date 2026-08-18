/**
 * Plan catalog.
 *
 * Cost basis (SOFTDOING, regional Iwate SMB market):
 *   - The DOMINANT cost is labor: ¥5,000,000 / month fixed.
 *   - Gemini API + Supabase/Vercel are minor at SMB usage
 *     (~¥500-2,000 / company / month combined).
 *   - So required revenue ≈ ¥5.35M / month, and the only real lever
 *     is ARPU × customer count.
 *
 * Strategy chosen: MARKET-SHARE PRIORITY (low price). Standard is the
 * floor that still keeps a coherent ladder; break-even sits beyond the
 * 3-year target (135 cos) at roughly ~269 paying companies, i.e. the
 * first years are intentionally funded losses to drive adoption.
 *
 *   blended ARPU ≈ 0.3×4,980 + 0.55×19,800 + 0.15×49,800 ≈ ¥19,850
 *   break-even   ≈ ¥5.35M / ¥19,850 ≈ 269 companies
 *
 * Targets (for reference): initial year 45 cos, 3-year 135 cos.
 */
export type PlanId = 'free' | 'starter' | 'basic' | 'standard' | 'pro' | 'enterprise';

export type Plan = {
  id: PlanId;
  name: string;
  tagline: string;
  /** Monthly price in JPY. 0 for the free tier. */
  priceJpy: number;
  /** Short pitch shown on the landing page card. */
  bestFor: string;
  /** Display-only feature checklist for the landing page. */
  features: string[];
  /** Highlight as the "recommended" card. */
  highlighted?: boolean;
  /** CTA button label. */
  ctaLabel: string;
  /** Bullet shown right under the price. */
  priceNote: string;
  /** Numeric limits used (later) for enforcement. */
  limits: {
    brains: number | 'unlimited';
    monthlyQuestions: number | 'unlimited';
    monthlyVoiceMinutes: number | 'unlimited';
    materialMb: number | 'unlimited';
    historyDays: number | 'unlimited';
    modelTier: 'flash' | 'pro' | 'pro-2.5';
  };
};

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'フリー',
    tagline: 'まずは触ってみたい個人の方へ',
    priceJpy: 0,
    bestFor: '個人 / 試用',
    priceNote: 'クレジットカード不要',
    ctaLabel: '無料ではじめる',
    limits: {
      brains: 1,
      monthlyQuestions: 20,
      monthlyVoiceMinutes: 15,
      materialMb: 1,
      historyDays: 3,
      modelTier: 'flash',
    },
    features: [
      'ブレイン 1 個',
      'テキスト質問 月 20 回',
      '音声会話 月 15 分(お試し)',
      '素材 合計 1 MB まで',
      '監査ログ・履歴: 3 日分',
      'コミュニティサポート',
    ],
  },
  {
    id: 'starter',
    name: 'スターター',
    tagline: '小さなチームや個人事業主の方へ',
    priceJpy: 4980,
    bestFor: '1〜5 名',
    priceNote: '1 アカウントあたりの月額',
    ctaLabel: '申し込む',
    limits: {
      brains: 3,
      monthlyQuestions: 300,
      monthlyVoiceMinutes: 60,
      materialMb: 30,
      historyDays: 30,
      modelTier: 'flash',
    },
    features: [
      'ブレイン 3 個',
      'テキスト質問 月 300 回',
      '音声会話 月 60 分',
      '素材 合計 30 MB まで',
      '監査ログ・履歴: 30 日分',
      'メールサポート',
    ],
  },
  {
    // 2026-08 新設。スターター→スタンダードの4倍ギャップを2倍刻みに整える
    // 中間プラン。価格は公表ROI基準「1日15分の削減=月1万円」の直下に置き、
    // 「削減効果 > 費用」を1行で言える位置に固定した。
    id: 'basic',
    name: 'ベーシック',
    tagline: '毎日の調べ物を任せたい方へ',
    priceJpy: 9800,
    bestFor: '1〜10 名',
    priceNote: '1 アカウントあたりの月額',
    ctaLabel: '申し込む',
    limits: {
      brains: 5,
      monthlyQuestions: 800,
      monthlyVoiceMinutes: 120,
      materialMb: 100,
      historyDays: 90,
      modelTier: 'pro',
    },
    features: [
      'ブレイン 5 個',
      'テキスト質問 月 800 回',
      '音声会話 月 2 時間',
      '素材 合計 100 MB まで',
      '監査ログ・履歴: 90 日分',
      '高精度モデルで回答',
    ],
  },
  {
    id: 'standard',
    name: 'スタンダード',
    tagline: '事業の中核に AI を入れる中小企業に',
    priceJpy: 19800,
    bestFor: '5〜30 名',
    priceNote: '1 アカウントあたりの月額',
    ctaLabel: '申し込む',
    limits: {
      brains: 8,
      monthlyQuestions: 2000,
      monthlyVoiceMinutes: 300,
      materialMb: 300,
      historyDays: 180,
      modelTier: 'pro',
    },
    features: [
      'ブレイン 8 個',
      'テキスト質問 月 2,000 回',
      '音声会話 月 5 時間',
      '素材 合計 300 MB(動画は 1 本 50 MB まで)',
      '監査ログ・履歴: 180 日分',
      'ブレイン譲渡 / 依頼ワークフロー',
      'メール + チャットサポート',
    ],
  },
  {
    id: 'pro',
    name: 'プロ',
    tagline: '部署横断・全社展開を行う大企業向け',
    priceJpy: 49800,
    bestFor: '30 名 〜',
    priceNote: '1 アカウントあたりの月額',
    ctaLabel: '申し込む',
    limits: {
      brains: 30,
      monthlyQuestions: 8000,
      monthlyVoiceMinutes: 600,
      materialMb: 2000,
      historyDays: 'unlimited',
      modelTier: 'pro-2.5',
    },
    features: [
      'ブレイン 30 個',
      'テキスト質問 月 8,000 回',
      '音声会話 月 10 時間',
      '素材 合計 2 GB(動画は 1 本 50 MB まで)',
      '監査ログ・履歴: 無期限保存',
      'CSV エクスポート',
      'カスタムペルソナ / 口調指定',
      '優先サポート',
    ],
  },
];

/**
 * 企業向け(組織テナント)プラン。個人向けの PLANS 配列とは別に持つ。
 * 上限は「1シート(1ユーザー)あたり」で、組織に所属するユーザーは
 * 個人プランではなくこの上限で制限される。料金はシート課金(請求書 /
 * 銀行振込)。開始価格を公開(¥2,980〜/シート・月)し、実額は人数と
 * 要件に応じて個別に案内する。priceJpy はその開始価格。
 */
export const ENTERPRISE_PLAN: Plan = {
  id: 'enterprise',
  name: 'エンタープライズ',
  tagline: '部署横断・全社導入する企業向け(シート課金)',
  priceJpy: 2980, // 1シートあたりの開始価格(公開)。実額は人数・要件で案内。
  bestFor: '組織 / 5 名〜',
  priceNote: '1 シート(1 ユーザー)あたり 月額(税別)',
  ctaLabel: 'お問い合わせ',
  limits: {
    // 席あたり上限は「フル利用時でも利益率3割を確保」する設計(2026-08 決定)。
    // 原価想定: テキスト1問 ≒ ¥1.5(Pro回答)、音声1分 ≒ ¥1.7。
    // 1,000問 + 180分 ≒ ¥1,810/席 → 席単価 ¥2,980 で利益率 約39%。
    // 個人プロ(8,000問/10時間)より必ず小さく保ち、価格逆転を防ぐ。
    brains: 10,
    monthlyQuestions: 1000,
    monthlyVoiceMinutes: 180,
    materialMb: 500,
    historyDays: 'unlimited',
    modelTier: 'pro-2.5',
  },
  features: [
    'ご契約は 5 シートから',
    'ユーザーごとにアカウント(監査・退職者対応に対応)',
    '会社管理者が自社メンバーを招待・管理',
    'シート課金・一括請求(請求書 / 銀行振込)',
    '1 ユーザーあたり ブレイン 10 個 / 質問 月 1,000 回',
    '1 ユーザーあたり 音声会話 月 3 時間 / 素材 500 MB',
    '監査ログ・履歴: 無期限 + CSV エクスポート',
    '最新最上位モデル / 優先サポート',
  ],
};

/** id からプラン定義を引く(個人4プラン + エンタープライズ)。 */
export function planById(id: PlanId): Plan {
  if (id === 'enterprise') return ENTERPRISE_PLAN;
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
}
