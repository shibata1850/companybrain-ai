# CompanyBrain AI

人物の動画・社内資料を学習し、その人の口調で **リアルタイム音声会話**
(Gemini Live)ができる日本語の社内ナレッジ AI。

本番: https://companybrain-ai-chi.vercel.app (Vercel / `main` ブランチ)

## 動作の流れ

1. ユーザーが人物の動画・文書・テキストをアップロードする。
2. サーバーは Gemini で文字起こし・要約 → チャンク分割 → 埋め込み
   (pgvector)として Supabase に保存する。
3. ユーザーは通話画面の「話す」ボタンひとつで音声会話を開始する。
   - サーバーが短命トークン(ephemeral token)を発行し、ブラウザが
     Gemini Live API へ直接 WebSocket 接続する(API キーは出さない)。
   - 会話中、モデルは `search_knowledge` ツールで RAG 検索を行い、
     学習素材に基づいて本人の口調で答える。
   - セッション再開(sessionResumption)で接続の約10分上限を越えて
     同じ会話を継げる。字幕・終話時の監査ログ保存つき。
4. 会話の中身は監査ログ(audit_logs)にサーバー保存される。画面の
   「最近の会話」スレッド表示は端末ごと(localStorage)——これは仕様。

## 主な機能

- ブレイン(人格)ごとの素材管理・フォルダ・重複整理・読み方辞書
  (固有名詞の発音登録)
- 招待制+セルフ登録、プラン(free/starter/basic/standard/pro +
  エンタープライズ組織テナント)と上限の実 enforce
- ブレインは作成者本人のみ利用可。管理者は監査のみ(他人のブレインでは
  会話できない)
- 依頼(管理者が代理作成して譲渡)・ゴミ箱・お知らせ・監査ドリルダウン
- キオスク(展示)モード: アクセスキー+1ブレイン限定の公開ディスプレイ。
  収差オーブの待機画面、字幕、デモループ。管理画面 /admin/kiosk で URL 発行
- メンテナンス画面 /admin/maintenance: 埋め込みの後追い生成、モデル死活確認

## 技術スタック

- Next.js 15(App Router, TypeScript)+ Tailwind CSS
- Supabase(Postgres + pgvector + Storage + Auth)
- Google Gemini API(@google/genai): Live 音声対話・文字起こし・埋め込み
- three.js(キオスクの収差オーブ演出)
- Vitest(ユニット)+ Playwright(E2E スモーク)

## 開発

```bash
npm install
cp .env.example .env.local   # 値を記入
npm run dev
```

検証: `npx tsc --noEmit` → `npx next build --no-lint` →
`npx vitest run` → `npx playwright test`。

ブランチ運用・AI(Claude)の作業規約は `CLAUDE.md`、仕様の経緯は
`docs/要件定義書.md` を参照。DB スキーマは `supabase/migrations/`。

## 補足(履歴)

旧アバター映像基盤(HeyGen / D-ID による回答動画の生成)は 2026-10 に
全撤去し、リアルタイム音声会話へ一本化した。チャット UI も同時期に
一時撤去(テキスト質問 API `/api/avatars/[id]/ask` は再実装に備えて温存)。
