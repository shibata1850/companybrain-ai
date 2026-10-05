import type { Metadata } from 'next';
import {
  LegalList,
  LegalPage,
  LegalSection,
  LegalTable,
} from '@/components/LegalPage';

export const metadata: Metadata = {
  title: 'プライバシーポリシー | CompanyBrain AI',
};

/**
 * プライバシーポリシー。外部送信先(Gemini API / Supabase / Vercel)と
 * 「モデル学習に使われない」ことの明記、人物の声・容姿という
 * センシティブ情報の扱いを中心に構成している。
 */
export default function PrivacyPage() {
  return (
    <LegalPage title="プライバシーポリシー" updated="制定日: 2026年10月5日">
      <LegalSection heading="1. 事業者情報">
        <p>
          SOFTDOING株式会社(以下「当社」)は、社内ナレッジAIサービス「CompanyBrain
          AI」(以下「本サービス」)における個人情報その他の利用者情報を、本ポリシーに従って取り扱います。
        </p>
      </LegalSection>

      <LegalSection heading="2. 取得する情報">
        <LegalList
          items={[
            'アカウント情報: メールアドレス、表示名、所属組織、プラン情報',
            '学習素材: 利用者が投入する動画・音声・文書・テキスト(人物の容姿・声・発言を含むことがあります)',
            '会話情報: ブレインへの質問、AIの回答、音声会話の文字起こし',
            '利用記録: 利用日時、質問件数、音声利用時間、操作ログ',
          ]}
        />
      </LegalSection>

      <LegalSection heading="3. 利用目的">
        <LegalList
          items={[
            '本サービスの提供(学習素材の分析・要約、質問への回答生成、音声会話)',
            '利用上限の管理、料金の請求、本人確認、不正利用の防止',
            '組織の管理者による利用状況の監査(質問・回答の記録の閲覧)',
            '障害対応、品質改善、お問い合わせへの対応',
          ]}
        />
      </LegalSection>

      <LegalSection heading="4. 外部サービスへの送信">
        <p>
          本サービスは、提供に必要な範囲で以下の外部サービスに情報を送信します。いずれも業務委託に相当する利用であり、これを超える第三者提供は、法令に基づく場合を除き行いません。
        </p>
        <LegalTable
          rows={[
            [
              'Google Gemini API(Google LLC)',
              '学習素材の分析、回答の生成、音声会話の処理。有料APIとして利用しており、送信されたデータが Google のAIモデルの学習に使用されることはありません。',
            ],
            [
              'Supabase Inc.',
              'データベースおよびファイルの保管。保存データは暗号化され、同社は SOC 2 Type 2 認証を取得しています。',
            ],
            [
              'Vercel Inc.',
              'アプリケーションの配信基盤。通信は TLS により暗号化されます。',
            ],
          ]}
        />
      </LegalSection>

      <LegalSection heading="5. 人物の声・容姿を含む情報の取扱い">
        <LegalList
          items={[
            '学習素材に含まれる人物の容姿・声・発言は、当該ブレインの応答生成の目的でのみ使用します。',
            '学習素材の投入には対象人物本人の同意が必要です(利用規約第6条)。本人から利用停止の申し出があった場合、当社は該当素材の削除に応じます。',
            '学習素材が当社または第三者のAIモデルの学習に使用されることはありません。',
          ]}
        />
      </LegalSection>

      <LegalSection heading="6. 安全管理措置">
        <LegalList
          items={[
            '通信の暗号化(TLS)および保存データの暗号化',
            'ブレイン単位のアクセス分離(ブレインの会話は作成者本人のみが行え、組織の管理者であっても他者のブレインを操作できません)',
            '招待制・認証によるアクセス制御、操作の監査記録',
          ]}
        />
      </LegalSection>

      <LegalSection heading="7. 保存期間と削除">
        <LegalList
          items={[
            '会話履歴の保存期間は契約プランの定めに従います。',
            '解約またはアカウント削除の申し出があった場合、当社は合理的な期間(原則30日以内)にアカウントに紐づくデータを削除します。バックアップからの完全消去には追加の期間を要することがあります。',
          ]}
        />
      </LegalSection>

      <LegalSection heading="8. Cookie 等について">
        <p>
          本サービスは、ログイン状態の維持など機能提供に必要な範囲でのみ Cookie
          およびブラウザのローカルストレージを使用します。広告配信や行動追跡を目的とした第三者 Cookie は使用していません。
        </p>
      </LegalSection>

      <LegalSection heading="9. 開示・訂正・削除の請求">
        <p>
          利用者本人またはその代理人は、当社が保有する個人情報について、開示・訂正・利用停止・削除を請求できます。下記の窓口までご連絡ください。本人確認のうえ、法令に従って対応します。
        </p>
        <LegalTable
          rows={[
            ['窓口', 'SOFTDOING株式会社 個人情報お問い合わせ窓口'],
            ['メール', 'info@softdoing.net'],
            ['電話', '0197-62-6557'],
          ]}
        />
      </LegalSection>

      <LegalSection heading="10. 改定">
        <p>
          本ポリシーを変更する場合は、本ページで公表します。重要な変更については、サービス内またはメールで利用者に通知します。
        </p>
      </LegalSection>
    </LegalPage>
  );
}
