import type { Metadata } from 'next';
import {
  LegalList,
  LegalPage,
  LegalSection,
  LegalTable,
} from '@/components/LegalPage';

export const metadata: Metadata = {
  title: 'セキュリティとデータ保護 | CompanyBrain AI',
};

/**
 * セキュリティ説明ページ。企業の情シス・法務の事前確認に答えるための
 * 事実ベースの1枚。実装済みの事実と「未対応(計画中)」を正直に分けて
 * 書く — 出来ていないことを出来ているように書かない。
 */
export default function SecurityPage() {
  return (
    <LegalPage
      title="セキュリティとデータ保護"
      updated="最終更新日: 2026年10月8日"
    >
      <LegalSection heading="データの流れ">
        <p>
          お客様のデータは、ブラウザから TLS で暗号化されて送信され、次の2つの基盤でのみ処理・保管されます。
        </p>
        <LegalTable
          rows={[
            [
              '回答の生成',
              'Google Gemini API(Google LLC)。有料APIとして利用しており、送信データが Google のAIモデルの学習に使用されることはありません。',
            ],
            [
              '保管',
              'Supabase(SOC 2 Type 2 認証取得)。データベースとファイルは保存時に暗号化されます。',
            ],
            [
              '配信',
              'Vercel。アプリケーションの配信基盤。全通信を TLS で暗号化します。',
            ],
          ]}
        />
        <p>
          上記以外の第三者にお客様のデータを提供することはありません(法令に基づく場合を除く)。
        </p>
      </LegalSection>

      <LegalSection heading="アクセス制御(実装済み)">
        <LegalList
          items={[
            '招待制+認証: アカウントは招待または登録審査を経て発行され、すべての操作に認証が必要です。',
            'ブレイン単位の分離: ブレインとの会話は作成した本人だけが行えます。組織の管理者であっても、他のメンバーのブレインを操作したり、なりすまして会話したりすることはできません。',
            '監査ログ: 誰がいつどのブレインに何を質問したかを記録し、組織の管理者が閲覧できます。「本人だけが使える」ことと「組織として説明責任を果たせる」ことを両立する設計です。',
            '利用上限の強制: プランごとの質問数・音声時間・容量の上限はシステムが強制します(自己申告ではありません)。',
          ]}
        />
      </LegalSection>

      <LegalSection heading="人物データの保護(実装済み)">
        <LegalList
          items={[
            '人物動画の学習には、被写体ご本人の同意確認が必須です(画面のチェックだけでなく、サーバー側でも検証します)。',
            'AIの回答画面には「AIによる再現であり、ご本人の発言ではない」ことを常時表示します。',
            '学習素材・会話が当社や第三者のAIモデルの学習に使われることはありません。',
          ]}
        />
      </LegalSection>

      <LegalSection heading="データの削除">
        <LegalList
          items={[
            '素材・ブレインは利用者がいつでも削除できます(ゴミ箱経由)。',
            '解約時は、原則30日以内にアカウントに紐づくデータを削除します。',
          ]}
        />
      </LegalSection>

      <LegalSection heading="現時点で未対応のもの(計画中)">
        <p>
          以下は現在未対応です。出来ているように装うことはしません。エンタープライズのお客様の要望に応じて優先順位を決め、順次対応します。
        </p>
        <LegalList
          items={[
            'SSO / SAML 連携(Google Workspace・Microsoft Entra ID 等)',
            '二要素認証(2FA)',
            'IPアドレス制限',
            '稼働率の保証(SLA)— 現状はベストエフォートでの提供です',
            'Google Drive・Notion 等の外部ストレージとの自動同期 — 現状は手動アップロードのみです。副作用として、AIが何を根拠に答えるかを管理者が完全に把握・統制できます',
          ]}
        />
      </LegalSection>

      <LegalSection heading="脆弱性のご報告・お問い合わせ">
        <p>
          セキュリティに関するご質問、脆弱性のご報告は info@softdoing.net
          (SOFTDOING株式会社)までご連絡ください。確認のうえ、誠実に対応します。
        </p>
      </LegalSection>
    </LegalPage>
  );
}
