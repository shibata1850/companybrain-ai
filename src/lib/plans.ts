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
export type PlanId = 'free' | 'starter' | 'standard' | 'pro';

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
      monthlyQuestions: 50,
      monthlyVoiceMinutes: 0,
      materialMb: 1,
      historyDays: 7,
      modelTier: 'flash',
    },
    features: [
      'ブレイン 1 個',
      'テキスト質問 月 50 回',
      '音声会話なし(テキスト回答のみ)',
      '素材 1 MB まで',
      'AI モデル: Gemini Flash',
      '履歴: 7 日間',
      'コミュニティサポート',
    ],
  },
  {
    id: 'starter',
    name: 'スターター',
    tagline: '小さなチームや個人事業主の方へ',
    priceJpy: 4980,
    bestFor: '1〜5 名',
    priceNote: 'ユーザー 5 名まで',
    ctaLabel: '申し込む',
    limits: {
      brains: 5,
      monthlyQuestions: 1000,
      monthlyVoiceMinutes: 30,
      materialMb: 100,
      historyDays: 30,
      modelTier: 'flash',
    },
    features: [
      'ブレイン 5 個',
      'テキスト質問 月 1,000 回',
      '音声会話 月 30 分',
      '素材 100 MB まで',
      'AI モデル: Gemini Flash (高速)',
      '履歴: 30 日間',
      '簡易監査ログ',
      'メールサポート',
    ],
  },
  {
    id: 'standard',
    name: 'スタンダード',
    tagline: '事業の中核に AI を入れる中小企業に',
    priceJpy: 19800,
    bestFor: '5〜30 名',
    priceNote: 'ユーザー 30 名まで・最人気',
    ctaLabel: '申し込む',
    highlighted: true,
    limits: {
      brains: 20,
      monthlyQuestions: 10000,
      monthlyVoiceMinutes: 300,
      materialMb: 1000,
      historyDays: 365,
      modelTier: 'pro',
    },
    features: [
      'ブレイン 20 個',
      'テキスト質問 月 10,000 回',
      '音声会話 月 5 時間',
      '素材 1 GB まで',
      'AI モデル: Gemini Pro (高精度)',
      '履歴: 1 年保存',
      'フル監査ログ',
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
    priceNote: 'ユーザー無制限',
    ctaLabel: '申し込む',
    limits: {
      brains: 'unlimited',
      monthlyQuestions: 50000,
      monthlyVoiceMinutes: 1200,
      materialMb: 'unlimited',
      historyDays: 'unlimited',
      modelTier: 'pro-2.5',
    },
    features: [
      'ブレイン 無制限',
      'テキスト質問 月 50,000 回',
      '音声会話 月 20 時間',
      '素材アップロード 無制限',
      'AI モデル: Gemini 2.5 Pro (最高精度)',
      '履歴: 無期限保存',
      'フル監査ログ + CSV エクスポート',
      'カスタムペルソナ / 口調指定',
      'API / Webhook / Make 連携',
      '優先サポート + SLA 99.9%',
    ],
  },
];
