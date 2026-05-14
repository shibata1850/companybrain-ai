# HeyGen Live Avatar セットアップ手順

CompanyBrain AI の Brain Studio に **HeyGen Interactive Avatar (Live Avatar)** を統合する手順です。

実現できること：
- Brain Studio 画面の「アバター動画」がループ再生ではなく **HeyGen のリアルタイム CG アバター** に
- チャットで送信した質問への Gemini 回答を、**アバターが声に出して話す**
- 視覚的に本人らしい AI アバターと対話する体験

---

## 前提

- ローカルセットアップ済み (`docs/local-only-setup.md` 完了)
- HeyGen アカウント（無料アカウントは Live Avatar の使用秒数制限あり、Pro 以上推奨）
- 本人動画から Digital Twin / Photo Avatar / Video Avatar を作成済み（または既存の Public Avatar 利用も可）

---

## Step 1: HeyGen API キーを取得

1. <https://app.heygen.com/> にログイン
2. 右上のアバターアイコン → **Settings**
3. 左サイドバー → **Subscriptions** または **API**
4. **「Create New API Key」** をクリック
5. キーをコピー（`xxxxx-xxxx-...` 形式）

⚠️ Live Avatar (Interactive Avatar) は有料機能です。料金プランは <https://www.heygen.com/pricing> を確認してください。

---

## Step 2: HeyGen Avatar ID を取得

### A. Photo Avatar / Avatar IV を使う場合（最速）
1. HeyGen ダッシュボード → **Avatars** → **Photo Avatars** または **My Avatars**
2. 使うアバターをクリック
3. URL の `/avatar/xxx` の `xxx` が avatar_id
4. または **「Use in Streaming」** ボタンから ID をコピー

### B. Digital Twin（実在人物動画から作る）を使う場合
1. HeyGen ダッシュボード → **Create Avatar** → **Digital Twin**（要 Pro 以上）
2. 本人の動画をアップロードして指示に従う
3. 完成後、avatar_id をコピー

### C. Public Avatar を使う場合（テスト用）
- HeyGen ダッシュボードの「Public Avatars」から好きなアバターを選ぶ
- 例：`Anna_public_3_20240108`

---

## Step 3: Voice ID（任意）

- HeyGen ダッシュボード → **Voices** → **My Voices** または **Voice Library**
- 使う Voice をクリック → ID をコピー
- 例：`1bd001e7e50f421d891986aad5158bc8`

未設定の場合、HeyGen のデフォルト音声が使われます。

---

## Step 4: `.env.local` に HEYGEN_API_KEY を設定

```env
# 既存の設定はそのまま
JWT_SECRET=...
GEMINI_API_KEY=AIzaSy...
GEMINI_MODEL=gemini-2.0-flash

# 新規追加
HEYGEN_API_KEY=（Step 1 で取得したキー）
```

サーバーを再起動（`npm run dev:all` を Ctrl+C → 再実行）。

---

## Step 5: Studio で avatar_id を登録

1. ブラウザで <http://localhost:5173> を開く
2. ログイン → Brain Avatar Studio を表示
3. 右側のタブから **「Live 設定」** をクリック
4. 以下を入力：
   - **HeyGen Avatar ID**：Step 2 でコピーした ID
   - **HeyGen Voice ID**：Step 3 でコピーした ID（任意）
5. **「保存」** をクリック

---

## Step 6: Live Avatar に接続

1. 左サイドの「HeyGen Live Avatar」パネルの **「Live Avatar に接続」** ボタンをクリック
2. 数秒で接続成功 → 上のアバター動画が HeyGen の Live ストリームに切り替わる
3. バッジが緑色「Live Avatar 接続中」表示になる

---

## Step 7: チャットで話す

1. **「対話」タブ** に戻る
2. メッセージを入力して送信
3. Gemini が回答を生成（Brain Person の話し方で）
4. **HeyGen アバターがその回答を音声で読み上げる** 🎤

---

## トラブルシューティング

### 「HeyGen が未設定です」エラー
- `.env.local` に `HEYGEN_API_KEY` が設定されているか確認
- サーバーを再起動

### 「avatar_id 未登録」エラー
- Live 設定タブで avatar_id を入力 → 保存
- 入力後にページをリロード

### 接続後すぐ切断される
- HeyGen の使用残量が無くなっている可能性（無料枠は 10 分/月など）
- HeyGen ダッシュボード → Subscriptions で確認

### Live Avatar の声が出ない
- ブラウザの音声権限を確認
- Voice ID が無効でないか確認（HeyGen ダッシュボードで再取得）

### 動画が映らない
- ブラウザの DevTools コンソールでエラーを確認
- WebRTC が有効か確認（一部の社内ネットワークでは制限される）

---

## API 構成

| エンドポイント | 用途 |
|---|---|
| `POST /api/heygen/session-token` | SDK 接続用の短期トークン発行 |
| `GET /api/heygen/avatars` | 利用可能アバター一覧（参考用） |
| `GET /api/heygen/voices` | 利用可能ボイス一覧（参考用） |
| `GET /api/heygen/status` | HeyGen 設定済みか判定 |

すべて `requireAuth` で保護されています。

## セキュリティ

- `HEYGEN_API_KEY` はサーバー側のみで保持。フロントには絶対に出ません
- フロント → サーバーに「session-token をください」と依頼
- サーバー → HeyGen API に API キー付きでアクセス → 短期トークンを返す
- フロント → SDK + 短期トークンで HeyGen に接続
- 短期トークン (~15min) が漏れても影響は最小限
