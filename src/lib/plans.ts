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
export type PlanId = 'free' | 'starter' | 'standard' | 'pro' | 'enterprise';

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
  bestFor: '組織 / 30 名〜',
  priceNote: '1 シート(1 ユーザー)あたり 月額(税別)',
  ctaLabel: 'お問い合わせ',
  limits: {
    brains: 50,
    monthlyQuestions: 10000,
    monthlyVoiceMinutes: 1200,
    materialMb: 5000,
    historyDays: 'unlimited',
    modelTier: 'pro-2.5',
  },
  features: [
    'ユーザーごとにアカウント(監査・退職者対応に対応)',
    '会社管理者が自社メンバーを招待・管理',
    'シート課金・一括請求(請求書 / 銀行振込)',
    '1 ユーザーあたり ブレイン 50 個 / 質問 月 10,000 回',
    '1 ユーザーあたり 音声会話 月 20 時間 / 素材 5 GB',
    '監査ログ・履歴: 無期限 + CSV エクスポート',
    '最新最上位モデル / 優先サポート',
  ],
};

/** id からプラン定義を引く(個人4プラン + エンタープライズ)。 */
export function planById(id: PlanId): Plan {
  if (id === 'enterprise') return ENTERPRISE_PLAN;
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
}
