import type { Metadata } from 'next';
import { LegalPage, LegalSection, LegalTable } from '@/components/LegalPage';

export const metadata: Metadata = {
  title: '特定商取引法に基づく表記 | CompanyBrain AI',
};

/**
 * 特定商取引法に基づく表記。
 * 【要記入】の2箇所(所在地・代表者)はユーザー(柴田さん)の入力待ち。
 * プレースホルダのまま本番公開しないこと。
 */
export default function LegalNoticePage() {
  return (
    <LegalPage title="特定商取引法に基づく表記" updated="最終更新日: 2026年10月5日">
      <LegalSection heading="事業者">
        <LegalTable
          rows={[
            ['販売事業者', 'SOFTDOING株式会社'],
            ['代表者', '【要記入: 代表者氏名】'],
            ['所在地', '【要記入: 本店所在地】'],
            ['電話番号', '0197-62-6557(受付: 平日 9:00〜17:00)'],
            ['メールアドレス', 'info@softdoing.net'],
            [
              'サービスサイト',
              'https://companybrain-ai-chi.vercel.app',
            ],
          ]}
        />
      </LegalSection>

      <LegalSection heading="販売価格">
        <LegalTable
          rows={[
            ['フリー', '月額 0円'],
            ['スターター', '月額 4,980円(税別)'],
            ['ベーシック', '月額 9,800円(税別)'],
            ['スタンダード', '月額 19,800円(税別)'],
            ['プロ', '月額 49,800円(税別)'],
            [
              'エンタープライズ',
              '基本料 月額 20,000円/社 + 1,980円/シート(税別・最低5シート)。導入支援(初期設定・学習素材の整備): 100,000円(税別・無料体験開始から30日以内の契約で半額)',
            ],
          ]}
        />
        <p>
          各プランの利用上限(ブレイン数・質問数・音声時間等)は、サービスサイトの料金表示をご確認ください。
        </p>
      </LegalSection>

      <LegalSection heading="商品代金以外の必要料金">
        <p>消費税、銀行振込に係る振込手数料。</p>
      </LegalSection>

      <LegalSection heading="支払方法・支払時期">
        <p>
          請求書払い(銀行振込)。当社発行の請求書に記載する支払期日までにお支払いください。
        </p>
      </LegalSection>

      <LegalSection heading="サービスの提供時期">
        <p>
          アカウント発行後、直ちにご利用いただけます(有料プランは、お申し込み内容の確認後にプランを適用します)。
        </p>
      </LegalSection>

      <LegalSection heading="キャンセル・解約について">
        <p>
          デジタルサービスの性質上、提供開始後の返金はお受けしていません。解約はダッシュボードからいつでも申請でき、解約月の末日までご利用いただけます(日割り返金はありません)。14日間の無料体験は、期間終了により自動的に有料契約へ移行することはありません。
        </p>
      </LegalSection>

      <LegalSection heading="動作環境">
        <p>
          最新版の Google Chrome / Safari / Microsoft Edge。音声会話にはマイクを利用できる端末が必要です。
        </p>
      </LegalSection>
    </LegalPage>
  );
}
