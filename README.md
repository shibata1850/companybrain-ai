# CompanyBrain AI

人物の動画から「顔」「声」「知識」を学習し、その人として質問に答える動画を
自動生成する社内ブレインアバターシステム。

## 動作の流れ

1. ユーザーが人物の話している動画をアップロードする。
2. サーバーは:
   - 動画から 1 フレーム抽出 → HeyGen に Talking Photo として登録
   - 動画から音声抽出 → HeyGen Instant Voice Clone で声を学習
   - Gemini で動画を文字起こし → チャンク分割 → ベクトル化 → Supabase に保存
3. ユーザーが画面から質問を投げる。
4. サーバーは:
   - 質問をベクトル化 → pgvector で関連発言を検索（RAG）
   - Gemini に「この人物として」回答させる
   - HeyGen に Photo Avatar + Cloned Voice + 回答テキストを渡して動画生成
5. 数十秒〜数分後、その人物が回答を喋っている動画がブラウザで再生できる。

複数のブレインを作成でき、それぞれ追加動画でいつでも学習を上乗せできる
（顔と声は最初の動画で確定）。

## 技術スタック

- Next.js 14（App Router, TypeScript）
- Supabase (Postgres + Storage + pgvector)
- Google Gemini API（文字起こし・要約・埋め込み・回答生成）
- HeyGen API（Photo Avatar + Instant Voice Clone + Video Generate）
- ffmpeg-static（動画からフレーム/音声抽出）
- Tailwind CSS

## セットアップ

### 1. Supabase プロジェクトを作成

1. <https://supabase.com> でプロジェクトを新規作成
2. SQL Editor で `supabase/migrations/0001_initial.sql` を実行
3. Storage で `companybrain` という名前のバケットを作成（Public でなくて OK）
4. Project Settings → API から `Project URL` / `anon key` / `service_role key` を控える

### 2. 環境変数を設定

```bash
cp .env.example .env.local
```

`.env.local` を開いて以下を埋める:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY` — <https://aistudio.google.com/apikey>
- `HEYGEN_API_KEY` — <https://app.heygen.com/settings?nav=API>

### 3. 起動

```bash
npm install
npm run dev
```

<http://localhost:3000> を開く。

## ディレクトリ構成

```
src/
├── app/
│   ├── page.tsx                          # ブレイン一覧
│   ├── avatars/new/page.tsx              # 新規作成 (動画アップロード)
│   ├── avatars/[id]/AvatarDetail.tsx     # 質問 / 動画再生 UI
│   └── api/
│       ├── avatars/route.ts              # 作成 / 一覧
│       ├── avatars/[id]/route.ts         # 詳細
│       ├── avatars/[id]/train/route.ts   # 追加学習
│       ├── avatars/[id]/ask/route.ts     # 質問 → 動画生成キック
│       └── generations/[id]/route.ts     # 生成ステータスのポーリング
└── lib/
    ├── supabase.ts                       # Supabase 管理クライアント
    ├── gemini.ts                         # 文字起こし / 埋め込み / 回答生成
    ├── heygen.ts                         # Photo Avatar / Voice Clone / Generate
    ├── media.ts                          # ffmpeg でフレーム+音声抽出
    └── processing.ts                     # 学習パイプライン (transcribe→chunk→embed→DB)

supabase/migrations/
└── 0001_initial.sql                      # avatars / training_videos / knowledge_chunks /
                                          # generations + match_knowledge_chunks RPC
```

## 注意点

- API キーはすべてサーバー側のみ。`NEXT_PUBLIC_*` 以外をクライアントに渡さない。
- HeyGen の Photo Avatar / Instant Voice Clone は有料プラン機能。プランを確認のうえご利用ください。
- 動画は Supabase Storage に保存されます。容量プランに注意。
- HeyGen Live Avatar (Interactive / Streaming Avatar) は使用しません。回答動画は
  非同期にレンダリングされ、完成すると UI に表示されます。
