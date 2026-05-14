# CompanyBrain AI

会社の脳みそを、対話で育てる。

経営者・上司・熟練社員の動画と声をもとに AI アバターを作成し、対話を通じて会社の判断基準・教育方針・営業方針・顧客対応方針を蓄積・整理・承認し、属人化を防ぐ「会社の脳みそ」を育てる AI エージェントアバターシステム。

## アーキテクチャ

- **Frontend**: React 18 + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Hono (Node.js)
- **Database / Auth / Storage**: Supabase (Postgres + Auth + Storage)
- **AI**: Google Gemini (server-side のみ呼び出し)

## クイックスタート

詳細は [`docs/migration-to-claude-code-stack.md`](docs/migration-to-claude-code-stack.md) を参照。

```bash
# 1. .env.local を作成
cp .env.example .env.local
# .env.local を編集して Supabase URL/keys と GEMINI_API_KEY を設定

# 2. 依存インストール
npm install

# 3. Supabase にスキーマを流す
#   Supabase Dashboard > SQL Editor で supabase/schema.sql を実行
#   Storage > Create bucket: brain-source-assets (private)

# 4. 起動（フロント + API を同時起動）
npm run dev:all
# → http://localhost:5173
```

## スクリプト

| コマンド | 用途 |
|---|---|
| `npm run dev` | フロント（Vite）開発サーバー |
| `npm run server:dev` | Hono バックエンド（--watch） |
| `npm run dev:all` | フロント + バックエンド同時起動 |
| `npm run build` | フロント本番ビルド |
| `npm run server:start` | バックエンド本番起動 |
| `npm run lint` | ESLint |

## ディレクトリ構成

```
companybrain-ai/
├── server/                  Hono バックエンド
│   ├── index.js
│   ├── lib/{supabase,gemini,auth-middleware}.js
│   └── routes/{auth,brain-persons,brain-assets,chat,brain-interviews,brain-policies}.js
├── supabase/
│   └── schema.sql           Supabase 用 SQL
├── src/                     React フロント
│   ├── App.jsx
│   ├── lib/{AuthContext,api,supabaseClient,useClientCompanyId,utils}.{js,jsx}
│   ├── pages/{Login,BrainEntryUpload,BrainAvatarStudio}.jsx
│   └── components/ui/       shadcn/ui
└── docs/                    設計ドキュメント
```

## セキュリティ

- API キーはサーバーサイドのみ
- テナント分離（`assertTenantAccess`）を `service_role` 操作の前に必ず実施
- 方針候補は人間承認後のみ `knowledge_chunks` に登録（AI が勝手に正式 Knowledge を更新しない）
- `admin_only` スコープは `softdoing_admin` のみ
- 動画 / 音声 / 同意書はプライベートバケット + signed URL

## ライセンス

Proprietary. SOFTDOING 株式会社.
