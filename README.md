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
- **Live Avatar**: HeyGen Interactive Avatar SDK（API キー必要、未設定時はアップロード動画ループ再生にフォールバック）

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
| `npm run server:start` | バックエンド起動（`dist/` があれば同時にフロント配信） |
| `npm run prod:build` | フロントをビルドしてからサーバー起動（単発本番起動） |
| `npm run lint` | ESLint |

## 本番デプロイ

本番では **同一の Node プロセスがフロント（`dist/`）と API（`/api/*`）の両方を配信**します。
追加のリバースプロキシは必須ではありません（HTTPS 終端は必要に応じて前段に置いてください）。

### Docker (推奨)

```bash
# 1. .env.local に本番値をセット（JWT_SECRET, GEMINI_API_KEY 等）
cp .env.example .env.local
# 編集

# 2. ビルド + 起動（データは名前付きボリュームに永続化）
docker compose up -d --build

# 3. 動作確認
curl http://localhost:3001/api/health
# → {"ok":true,...}
```

ボリューム:
- `companybrain_data`     → SQLite DB (`/app/data/companybrain.db`)
- `companybrain_uploads`  → アップロードファイル (`/app/uploads`)

停止と再起動はデータを保持: `docker compose down && docker compose up -d`
データごと初期化: `docker compose down -v`

### 素の Node で本番起動

```bash
npm ci --omit=dev   # ※ dev 依存も含む場合は npm ci
npm run build
NODE_ENV=production npm run server:start
```

`.env.local` で本番設定を上書きできます。アプリは `http://0.0.0.0:${SERVER_PORT|3001}` で待ち受けます。

### 必須の本番設定

| 環境変数 | 説明 |
|---|---|
| `JWT_SECRET` | 32文字以上のランダム文字列。**必ず固定値**を設定（未設定だと再起動でセッション失効）。 |
| `GEMINI_API_KEY` | AI チャット・方針抽出に使用。<https://aistudio.google.com/apikey> |
| `SERVER_PORT` | 待受ポート（デフォルト 3001） |
| `DB_PATH` | SQLite ファイルパス（永続化先。デフォルト `./data/companybrain.db`） |
| `UPLOAD_DIR` | アップロードファイル保存先（デフォルト `./uploads`） |
| `HEYGEN_API_KEY` | （任意）Live Avatar を有効化。未設定なら動画ループ再生にフォールバック |

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
