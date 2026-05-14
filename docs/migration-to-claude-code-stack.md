# CompanyBrain AI — Claude Code スタックへの移行ガイド

| 項目 | 内容 |
|---|---|
| 移行元 | Base44 (SDK / Backend Functions / Entities / Auth / Storage) |
| 移行先 | React + Vite (現状維持) / Hono / Supabase Postgres + Auth + Storage / Gemini API 直叩き |
| スコープ | Brain Studio コア体験のみ（動画アップ → アバター → 対話 → インタビュー → 方針抽出 → 承認 → Knowledge化） |
| 削除済み | base44 ディレクトリ、Base44 SDK 依存ページ 27 件、Sidebar、AppLayout |

---

## 新アーキテクチャ

```
┌────────────────────────────────────────────────────┐
│ Frontend: React + Vite                             │
│   src/pages/Login.jsx              ログイン         │
│   src/pages/BrainEntryUpload.jsx   真っ白画面・動画アップ │
│   src/pages/BrainAvatarStudio.jsx  アバター+対話+承認 │
│   src/lib/AuthContext.jsx          Supabase Auth   │
│   src/lib/api.js                   Hono API client │
└────────────────────────────────────────────────────┘
                  │  Bearer JWT (Supabase access token)
                  ▼
┌────────────────────────────────────────────────────┐
│ Backend: Hono on Node.js (server/)                 │
│   /api/auth/me                                     │
│   /api/brain-persons    GET / POST / PATCH         │
│   /api/brain-assets     POST(multipart)/GET/signed │
│   /api/chat             POST                       │
│   /api/brain-interviews POST/turn/complete         │
│   /api/brain-policies   GET / decision             │
└────────────────────────────────────────────────────┘
        │                       │
        ▼                       ▼
┌──────────────────┐    ┌─────────────────────────┐
│ Supabase         │    │ Google Gemini API       │
│ - Postgres       │    │ (server-side のみ)      │
│ - Auth           │    └─────────────────────────┘
│ - Storage        │
└──────────────────┘
```

---

## 初回セットアップ（あなたの作業）

### 1. Supabase プロジェクトを作る

1. <https://supabase.com> にアクセスして無料アカウント作成
2. **「New Project」** クリック
3. プロジェクト名: `companybrain-ai` 等、リージョン: `Tokyo (Northeast Asia)` 推奨
4. データベースパスワードを設定（保管）
5. プロジェクト作成完了まで 2-3 分待つ

### 2. スキーマを流す

1. Supabase ダッシュボード左サイドバーの **「SQL Editor」** を開く
2. 「**+ New query**」
3. `supabase/schema.sql` の内容を全部コピペ
4. **「Run」** ボタンをクリック
5. エラー無く完了することを確認（再実行しても安全）

### 3. Storage バケットを作る

1. Supabase 左サイドバーの **「Storage」** を開く
2. 「**Create a new bucket**」
3. Name: `brain-source-assets`
4. **Public bucket: OFF**（重要：プライベート）
5. Create

### 4. URL とキーを取得

Supabase 左下の **「Project Settings」 → 「API」**:
- **Project URL** (`https://xxx.supabase.co`)
- **anon public key** (フロント用、`VITE_SUPABASE_ANON_KEY` に使用)
- **service_role key** (バックエンド用、絶対公開禁止、`SUPABASE_SERVICE_ROLE_KEY` に使用)

### 5. Gemini API キーを取得

<https://aistudio.google.com/apikey> で **「Create API key」** → `AIzaSy...` をコピー。

### 6. .env.local を作る

プロジェクトルートに `.env.local` を新規作成（`.env.example` をコピー）：

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi....
VITE_API_BASE_URL=/api
VITE_API_PROXY=http://localhost:3001

SERVER_PORT=3001
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi....
GEMINI_API_KEY=AIzaSy....
GEMINI_MODEL=gemini-2.0-flash
```

### 7. 依存をインストール

```bash
cd C:/Users/shiba/companybrain-ai
npm install
```

### 8. ローカル起動

```bash
npm run dev:all
```

→ フロントと API サーバーが同時起動：
- フロント: <http://localhost:5173>
- API: <http://localhost:3001>

または別ターミナルで分けて：
```bash
npm run dev          # フロント
npm run server:dev   # API サーバー (別ターミナル)
```

### 9. アカウント登録 → user_profile を作る

1. <http://localhost:5173> を開く → ログイン画面が出る
2. **「アカウントを作成する」** → メール・パスワード入力
3. 確認メールが来たらリンクを開く（Supabase 側で必要に応じて）
4. ログイン後、「ユーザー初期設定が完了していません」と表示される
5. **Supabase ダッシュボード → SQL Editor** で以下を実行（自分用の最低限 setup）：

```sql
-- ① テスト会社を 1 社作る
INSERT INTO client_companies (company_name, plan_name)
VALUES ('テスト株式会社', 'Professional')
ON CONFLICT DO NOTHING
RETURNING id;
-- 返ってきた client_company_id をメモ

-- ② 自分の user_profile を作る (auth.users.id は Supabase Auth ダッシュボードで確認)
INSERT INTO user_profiles (user_id, client_company_id, business_role, display_name)
VALUES (
  'YOUR_AUTH_USER_ID',
  'CLIENT_COMPANY_ID_FROM_STEP_1',
  'softdoing_admin',     -- 自分は管理者
  '山田 太郎'
);
```

→ アプリをリロードすると、真っ白な動画アップロード画面が出る。

### 10. 動画アップロードで Brain を作る

1. 動画ファイル（短い mp4 でOK）をドロップ
2. 「Brain が誕生しました」表示後、Studio 画面に遷移
3. **対話タブ**でアバターと話せる
4. **Brain Interview タブ**でインタビュー開始 → 5 ターン以上対話 → 「完了して方針抽出」
5. **レビュータブ**で承認 → KnowledgeChunk として登録

---

## 本番デプロイ（後日）

### フロントエンド: Vercel
- リポジトリを Vercel に接続
- Build Command: `npm run build`
- Output Directory: `dist`
- Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL` (バックエンドの公開 URL)

### バックエンド: Railway / Render / Fly.io
- リポジトリ接続
- Start Command: `npm run server:start`
- Environment Variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `SERVER_PORT`

### Supabase: マネージドのまま
- 上記で作ったプロジェクトをそのまま使う
- 本番用には別プロジェクトを推奨

---

## API エンドポイント一覧

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/health` | ヘルスチェック |
| GET | `/api/auth/me` | 自分のユーザー情報 |
| GET | `/api/brain-persons` | 一覧（自テナント） |
| GET | `/api/brain-persons/:id` | 詳細 |
| POST | `/api/brain-persons` | 新規作成 |
| PATCH | `/api/brain-persons/:id` | 更新 |
| GET | `/api/brain-assets?brainPersonId=` | 素材一覧 |
| POST | `/api/brain-assets` | アップロード (multipart) |
| GET | `/api/brain-assets/:id/signed-url` | 動画再生用 signed URL |
| POST | `/api/chat` | アバターと対話 |
| GET | `/api/brain-interviews?brainPersonId=` | セッション一覧 |
| GET | `/api/brain-interviews/:id` | セッション詳細 |
| POST | `/api/brain-interviews` | セッション開始 |
| POST | `/api/brain-interviews/:id/turn` | 1 ターン進める |
| POST | `/api/brain-interviews/:id/complete` | 完了 → 方針抽出 |
| GET | `/api/brain-policies?brainPersonId=&status=` | 候補一覧 |
| POST | `/api/brain-policies/:id/decision` | 承認 / 却下 |

すべてのエンドポイントは `Authorization: Bearer <supabase_access_token>` 必須。

---

## セキュリティ設計

- **API キーはサーバー側のみ**（`GEMINI_API_KEY`、`SUPABASE_SERVICE_ROLE_KEY`）
- **テナント分離**: 各エンドポイントで `clientCompanyId` を user_profile から取得し、リクエスト対象と一致確認（`softdoing_admin` のみ横断可）
- **RLS 有効化**: Supabase の全テーブルで Row Level Security 有効。policy 未定義のため、anon キーからは何もアクセス不可。service_role のみが Hono 経由でアクセス
- **方針承認は人間が必須**: `brain_policy_candidates` は draft 保存、`client_admin` / `softdoing_admin` が承認すると `knowledge_chunks` に作成
- **`admin_only` スコープは softdoing_admin のみ**: 抽出時にもサニタイズ、承認時にもサニタイズ
- **動画は private bucket + signed URL**: 公開不可、毎回 1 時間有効の URL を発行

---

## 削除した既存資産

このコミットで以下を削除しました（Base44 依存のため）：

```
base44/ ディレクトリ全体（27 Entity + 22 Function）
src/api/base44Client.js
src/components/{ProtectedRoute, UserNotRegisteredError}.jsx
src/components/{knowledge, script, shared, chat, layout}/
src/lib/{PageNotFound, app-params}.{js,jsx}
src/pages/ から Brain Studio コア以外の 32 ページ
```

過去の Base44 ベースの実装は git 履歴で参照可能 (`git log --all`)。

---

## 次のフェーズ候補

| フェーズ | 内容 |
|---|---|
| Phase 2A | HeyGen Digital Twin API 統合（実際のアバター生成） |
| Phase 2B | LiveAvatar API 統合（リアルタイム音声会話） |
| Phase 3 | 新人研修モード / 仕事レビュー / 営業ロールプレイ |
| Phase 4 | Brain 完成度スコア改良 / 利用ログ可視化 |
| Phase 5 | 多テナント運用：ユーザー管理画面 / プラン管理 |
