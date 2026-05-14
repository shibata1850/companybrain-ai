# CompanyBrain AI — ローカル完結セットアップガイド

外部サービスへの登録は **Gemini API キー 1 つだけ**。それ以外は全部あなたの PC のローカルで動きます。

## アーキテクチャ

```
┌──────────────────────────────────────────────┐
│ React + Vite (frontend, localhost:5173)     │
└──────────────────────────────────────────────┘
              │ fetch /api/*
              ▼
┌──────────────────────────────────────────────┐
│ Hono on Node.js (backend, localhost:3001)   │
│   - SQLite (data/companybrain.db)           │
│   - JWT + bcrypt (自前認証)                  │
│   - Local fs (uploads/)                      │
└──────────────────────────────────────────────┘
              │
              ▼
       ┌─────────────────────┐
       │ Gemini API          │
       │ (server-side only)  │
       └─────────────────────┘
```

## 外部依存

| サービス | 必要性 | 理由 |
|---|---|---|
| Google Gemini API | 必須 | AI 対話 + 方針抽出 |
| GitHub | 任意 | コード公開・バックアップ用 |
| なし以外 | — | 完全ローカル |

## セットアップ

### 1. Gemini API キーを取得

<https://aistudio.google.com/apikey>
1. Google アカウントでログイン
2. **「Create API key」** → プロジェクト選択 → キーが発行される
3. `AIzaSy...` で始まる文字列をコピー

**無料枠**：分単位のレート制限はあるが、個人利用ならまず無料枠で足りる。

### 2. JWT_SECRET を生成

`.env.local` に書き込む長いランダム文字列を作る：

#### Git Bash / WSL / Mac / Linux
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### Windows PowerShell
```powershell
[Convert]::ToBase64String((1..32 | %{[byte](Get-Random -Max 256)}))
```

#### Windows コマンドプロンプト
```cmd
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

出力された 64 文字（hex）または 44 文字（base64）の文字列をコピー。

### 3. `.env.local` を作成

```bash
cd C:/Users/shiba/companybrain-ai
cp .env.example .env.local
```

`.env.local` をテキストエディタで開いて以下を埋める：

```env
VITE_API_BASE_URL=/api
VITE_API_PROXY=http://localhost:3001
SERVER_PORT=3001

JWT_SECRET=（手順 2 で生成した文字列）
GEMINI_API_KEY=AIzaSy....（手順 1 のキー）
GEMINI_MODEL=gemini-2.0-flash
```

### 4. 依存をインストール

```bash
npm install
```

`better-sqlite3` はネイティブビルドが入るので、Windows の場合は **Visual Studio Build Tools** が必要かもしれません。エラーが出たら：

```powershell
npm install --global windows-build-tools
```

または Visual Studio Installer で「C++ によるデスクトップ開発」を追加してください。

### 5. 起動

```bash
npm run dev:all
```

これで 2 つのサーバーが同時起動：
- フロント: <http://localhost:5173>
- API: <http://localhost:3001>

### 6. ブラウザでアクセス

<http://localhost:5173> を開く → 「ログイン」または「新規登録」画面が表示される。

### 7. 最初のアカウントを登録

「新規アカウントを作成する」をクリック → 表示名・メール・パスワード（6 文字以上）を入力 → 登録。

**自動で以下が行われます**：
- ユーザーが作成される
- 「デフォルト株式会社」が自動作成される
- あなたは `softdoing_admin`（最上位管理者）として紐付けられる
- ログイン状態になる

### 8. 真っ白な画面で動画をアップロード

ログイン後、真っ白な画面に動画ドロップゾーンが表示される。

短い動画ファイル（例：自撮りで 30 秒程度の挨拶動画）をドロップ → Brain Person が自動生成され、Avatar Studio に遷移。

### 9. アバターと対話する

Studio 画面で：
- 左：アップロードした動画がループ再生（暫定アバター）
- 右：3 タブ
  - **対話** — アバターと自由に話せる
  - **Brain Interview** — AI インタビュアーが質問してくる
  - **レビュー** — 抽出された方針候補を承認/却下

### 10. 方針を承認して Knowledge 化

Brain Interview を 5 ターン以上やって「完了して方針抽出」→ レビュータブに候補が並ぶ → 各候補で「承認 → Knowledge 化」をクリック → 正式な会社方針として `knowledge_chunks` に登録される。

次回からの対話では、承認済みの方針も参照されます。

---

## データのバックアップ

ローカル運用なので、自分でバックアップを取る必要があります：

```bash
# 重要なファイル 2 つ
cp data/companybrain.db backup/companybrain.$(date +%Y%m%d).db
cp -r uploads backup/uploads.$(date +%Y%m%d)
```

## トラブルシューティング

### `better-sqlite3` のインストールでエラー
- Windows: Visual Studio Build Tools が必要
- Mac: Xcode Command Line Tools (`xcode-select --install`)
- Linux: `build-essential`

### 「Gemini API error」
- `GEMINI_API_KEY` が正しいか確認
- レート制限に当たっていないか確認（無料枠は分単位制限あり）

### ログインできない
- `data/companybrain.db` を削除して `npm run dev:all` 再起動 → 初回登録からやり直し

### ポート 5173 / 3001 が既に使われている
- `.env.local` で `SERVER_PORT` を変更
- 既存プロセスを kill: Windows `taskkill /F /IM node.exe`

## API エンドポイント一覧

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/health` | ヘルスチェック |
| POST | `/api/auth/register` | 新規登録 |
| POST | `/api/auth/login` | ログイン |
| GET | `/api/auth/me` | 自分のユーザー情報 |
| GET / POST / PATCH | `/api/brain-persons[/:id]` | Brain Person CRUD |
| GET / POST | `/api/brain-assets` | 素材 |
| GET | `/api/brain-assets/:id/signed-url` | 動画再生用 URL |
| GET | `/api/files/:token` | ファイル本体（範囲リクエスト対応） |
| POST | `/api/chat` | アバターと対話 |
| GET / POST / POST(:id/turn) / POST(:id/complete) | `/api/brain-interviews` | Brain Interview |
| GET / POST(:id/decision) | `/api/brain-policies` | 方針候補レビュー |
