# CompanyBrain AI

会社の脳みそを、対話で育てる。

経営者・上司・熟練社員の動画と声をもとに AI アバターを作成し、対話を通じて会社の判断基準・教育方針・営業方針・顧客対応方針を蓄積・整理・承認し、属人化を防ぐ「会社の脳みそ」を育てる AI エージェントアバターシステム。

## アーキテクチャ（Local-Only スタック）

外部サービスへの登録は **Gemini API キー 1 つだけ** で済みます。それ以外は全部あなたの PC のローカルで動きます。

- **Frontend**: React 18 + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Hono (Node.js)
- **Database**: **SQLite** (better-sqlite3) — 単一ファイル `data/companybrain.db`
- **Auth**: 自前 JWT + bcrypt（メール + パスワード）
- **Storage**: **ローカルファイルシステム** (`uploads/`)
- **AI**: Google Gemini (server-side のみ、API キー必要)

## クイックスタート（3 ステップ）

### 1. Gemini API キーを取得

<https://aistudio.google.com/apikey> で「Create API key」→ `AIzaSy...` をコピー。

### 2. `.env.local` を作成

```bash
cp .env.example .env.local
# .env.local を開いて以下を埋める:
#   JWT_SECRET=（ランダム文字列 32 文字以上）
#   GEMINI_API_KEY=AIzaSy...
```

JWT_SECRET 生成例（Windows PowerShell）：
```powershell
[Convert]::ToBase64String((1..32 | %{[byte](Get-Random -Max 256)}))
```

または Git Bash:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. 依存をインストールして起動

```bash
npm install
npm run dev:all
```

ブラウザで <http://localhost:5173> を開く → ログイン画面 → **「新規アカウントを作成する」** で登録。

**最初に登録したアカウントは自動で `softdoing_admin`（最上位管理者）になり、「デフォルト株式会社」が自動作成されます。** Supabase 等の外部設定は一切不要です。

### 4. 動画をアップロード

ログイン後、真っ白な画面に動画ドロップゾーンが表示されます。動画ファイルをドラッグ&ドロップすると、Brain Person が自動生成され、アバター対話画面に遷移します。

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
├── server/                 Hono + SQLite バックエンド
│   ├── index.js
│   ├── lib/{db,auth,storage,context,auth-middleware,gemini}.js
│   ├── db/schema.sql      SQLite スキーマ (起動時に自動適用)
│   └── routes/{auth,brain-persons,brain-assets,chat,brain-interviews,brain-policies,files}.js
├── src/                    React フロント
│   ├── App.jsx
│   ├── lib/{AuthContext,api,useClientCompanyId,utils}.{js,jsx}
│   ├── pages/{Login,BrainEntryUpload,BrainAvatarStudio}.jsx
│   └── components/ui/      shadcn/ui
├── data/                   SQLite ファイル（自動生成、.gitignore）
├── uploads/                アップロードファイル（自動生成、.gitignore）
└── docs/                   設計ドキュメント
```

## セキュリティ

- API キー（`GEMINI_API_KEY`, `JWT_SECRET`）はサーバー側のみ
- テナント分離（`assertTenantAccess`）を全 API で実施
- 方針候補は人間承認後のみ `knowledge_chunks` に登録（AI が勝手に正式 Knowledge を更新しない）
- `admin_only` スコープは `softdoing_admin` のみ
- 動画 / 音声 / 同意書は **uploads/ 配下のプライベートファイル** + 1 時間有効の JWT 付き URL

## バックアップ

ローカル動作なので、バックアップは自分で：
- `data/companybrain.db` をコピー（DB 全体）
- `uploads/` をコピー（アップロードファイル）

## ライセンス

Proprietary. SOFTDOING 株式会社.
