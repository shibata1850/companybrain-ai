# CompanyBrain AI アーキテクチャ監査レポート

| 項目 | 内容 |
|---|---|
| 対象リポジトリ | `C:\Users\shiba\companybrain-ai` |
| 監査実施日 | 2026-05-07 |
| 監査範囲 | `src/` + `base44/functions/` + `base44/entities/` 全件 |
| 由来 | Base44 で作成された MVP（App ID: `69fc2a724da66aa341658ced`） |
| Base URL | `https://imported-brain-core-flow.base44.app` |
| 監査者 | Claude Code（読み取り専用、コード変更なし） |

凡例: 🔴 重大 / 🟡 警告 / 🟢 OK

---

## 1. プロジェクト構成

```
companybrain-ai/
├── base44/
│   ├── config.jsonc
│   ├── entities/   ... 27 Entity 定義 (.jsonc)
│   └── functions/  ... 22 Backend Function (各 entry.ts)
├── src/
│   ├── App.jsx                ... ルート定義 (25 routes)
│   ├── api/base44Client.js    ... Base44 SDK 初期化
│   ├── components/
│   │   ├── ProtectedRoute.jsx (定義のみ・未使用)
│   │   ├── UserNotRegisteredError.jsx
│   │   ├── chat/ChatInterface.jsx (dead code)
│   │   ├── knowledge/ExtractionPreview.jsx
│   │   ├── layout/{AppLayout, Sidebar}.jsx
│   │   ├── script/{AudioGenerator, LipsyncGenerator, ScriptResult, VideoUploader}.jsx
│   │   ├── shared/{PageHeader, StatCard}.jsx
│   │   └── ui/  (shadcn/ui 系)
│   ├── lib/{AuthContext, app-params, query-client, utils, PageNotFound}.jsx
│   └── pages/   ... 27 画面
└── .env.local   ... VITE_BASE44_APP_ID, VITE_BASE44_APP_BASE_URL のみ
```

---

## 2. 既存画面一覧（27 画面）

| # | 画面 | 役割 | ルート | 想定権限 |
|---|------|------|--------|----------|
| 1 | Dashboard | 統合ダッシュボード（KPI, 質問件数） | `/` | 認証ユーザー全員 |
| 2 | CompanyProfile | 会社基本情報 | `/company-profile` | 編集権想定（ガード無） |
| 3 | Philosophy | 理念・判断基準 | `/philosophy` | 編集権想定（ガード無） |
| 4 | KnowledgeUpload | 資料アップロード→AI 抽出 | `/knowledge-upload` | 編集権想定（ガード無） |
| 5 | KnowledgeList | ナレッジ一覧／承認 | `/knowledge-list` | 管理者想定（ガード無） |
| 6 | AIChat | 統合 AI（4 channel 切替） | `/ai-chat` | 全モード自由切替 🔴 |
| 7 | AdminUserSettings | 自己プロフィール編集 | `/admin-user-settings` | **誰でも自分のロール変更可** 🔴 |
| 8 | PublicAIPreview | 社外向け AI（public のみ） | `/public-ai-preview` | 認証必須 |
| 9 | InternalAIChat | 社内向け AI | `/internal-ai-chat` | businessRole フィルタあり 🟢 |
| 10 | ExecutiveAIChat | 経営者向け AI（5 セクション） | `/executive-ai-chat` | businessRole フィルタあり 🟢 |
| 11 | ScriptGenerator | 動画台本生成＋音声/動画 | `/scripts` | プランガード無 🔴 |
| 12 | ExecutiveDashboard | KPI/OKR/CPA/LTV 編集 | `/executive-dashboard` | executive 想定（ガード無） |
| 13 | UsageAndBilling | プラン・利用状況 | `/usage-and-billing` | 認証ユーザー全員 |
| 14 | AnswerLogs | 回答ログ検索／CSV 出力 | `/answer-logs` | 管理者想定（ガード無） |
| 15 | ExecutiveAvatarManagement | アバター CRUD・診断 | `/avatar-management` | 管理者想定（ガード無） |
| 16 | AvatarConsentRegistration | 本人同意・素材アップ・承認 | `/avatar-consent/:avatarId` | 承認ボタンのみ admin 系限定 🟡 |
| 17 | AvatarCreationSetup | HeyGen/LiveAvatar ID 登録・診断 | `/avatar-creation/:avatarId` | 管理者想定（ガード無） |
| 18 | AvatarConsultationRoom | LiveAvatar 相談セッション | `/avatar-consultation` | 認証ユーザー全員 |
| 19 | NewEmployeeTraining | シナリオ研修＋評価 | `/avatar-training` | 認証ユーザー全員 |
| 20 | WorkReviewPage | 仕事文書のレビュー依頼 | `/work-review` | 認証ユーザー全員 |
| 21 | AvatarContextSync | Context のアバター同期 | `/avatar-context/:avatarId` | 管理者想定（ガード無） |
| 22 | SessionLogs | アバター会話ログ閲覧 | `/session-logs` | 管理者想定（ガード無） 🔴 |
| 23 | AvatarUsageStats | 月次アバター利用量 | `/avatar-usage` | 認証ユーザー全員 |
| 24 | ExecutiveBrainDemo | 営業デモ用 6 ステップ | `/executive-brain-demo` | 認証ユーザー全員 |
| 25 | ExecutiveBrainPreLaunchTest | 公開前 10 項目チェック | `/executive-brain-pre-launch-test` | admin 想定（情報表示のみ） |
| 26 | **ExecutiveBrainDiagnostics** | API キー・接続診断 | **App.jsx 未登録** 🔴 | — |
| 27 | **PricingPlans** | プラン比較カード | **App.jsx 未登録** 🔴 | — |

### 🔴 ルーティング指摘
- `App.jsx:1-34` の import に `ExecutiveBrainDiagnostics` `PricingPlans` が無く、対応 `<Route>` も未定義。**到達不能**。
- `Sidebar.jsx:11-66` の `navGroups` に `/video-studio` `/videos` `/settings` が含まれるが、これらは `App.jsx` に未登録 → 404 リンク。
- 逆に `PricingPlans` `Diagnostics` は Sidebar からも到達不能。

---

## 3. Backend Function 一覧（22 関数）

すべて `Deno.serve()` + `createClientFromRequest` + `base44.auth.me()` 構成。POST 受信前提で HTTP method 制限なし。

| # | Function | 概要 | 主要入力 | 認証/権限 |
|---|---|---|---|---|
| 1 | `aiChat` | channel 別 AI Chat（InvokeLLM 経由） | `question, channel, clientCompanyId` | auth.me + role×scope×tenant 検証 🟢 |
| 2 | `askCompanyBrain` | RAG 型 Gemini Chat（会社ナレッジ参照） | `clientCompanyId, question, channel, category` | auth.me + tenant + scope 🟡 |
| 3 | `checkExecutiveAvatarUsageLimit` | アバター利用上限チェック | `clientCompanyId, usageType, requestedUnits` | auth.me のみ 🟡 |
| 4 | `checkHeygenLipsync` | HeyGen Lipsync ジョブ status 取得＋更新 | `videoProjectId` | auth.me のみ 🔴 |
| 5 | `checkPlanLimits` | プラン全体集計 | `clientCompanyId, featureType` | auth.me のみ 🟡 |
| 6 | `checkUsageLimit` | 個別 usageType 上限チェック | `clientCompanyId, usageType, requestedUnits` | auth.me のみ 🟡 |
| 7 | `createDemoExecutiveBrainData` | デモアバター/シナリオ作成 | `clientCompanyId` | role==='admin' 🟡 |
| 8 | `createExecutiveAvatarFromSourceVideo` | HeyGen Digital Twin 作成 | `clientCompanyId, avatarProfileId, creationMode` | auth.me のみ 🔴 |
| 9 | `createExecutiveBrainDemoData` | デモアバター作成（拡張） | `clientCompanyId` | role==='admin' 🟡 |
| 10 | `createExecutiveBrainSampleData` | サンプルアバター作成 | `clientCompanyId` | role==='admin' 🟡 |
| 11 | `createHeygenLipsync` | HeyGen Lipsync ジョブ作成 | `videoProjectId, mode` | auth.me のみ 🔴 |
| 12 | `createRecordedExecutiveAvatarVideo` | 録画型アバター動画 VideoProject 生成 | `clientCompanyId, avatarProfileId, script, purpose` | auth.me のみ＋consent 検証なし 🔴 |
| 13 | `debugExecutiveBrainIntegration` | API Key/接続診断 | `clientCompanyId` | auth.me のみ 🟡 |
| 14 | `evaluateAvatarTrainingSession` | Gemini で研修評価 | `avatarConversationSessionId` | auth.me のみ 🔴 |
| 15 | `fetchExecutiveAvatarTranscript` | LiveAvatar Transcript 取得 | `avatarConversationSessionId` | auth.me のみ 🔴 |
| 16 | `generateSpeech` | OpenAI TTS 音声生成 | `videoProjectId, voice` | auth.me のみ＋プラン無 🔴 |
| 17 | `generateVideoScript` | OpenAI(GPT-4o) で台本生成 | `clientCompanyId, purpose, targetAudience...` | auth.me のみ＋tenant 無 🔴 |
| 18 | `registerAvatarProviderIds` | HeyGen/LiveAvatar IDs 登録 | `avatarProfileId, heygenAvatarId, ...` | auth.me のみ 🔴 |
| 19 | `reviewWorkWithExecutiveBrain` | Gemini で仕事レビュー | `clientCompanyId, avatarProfileId, inputText...` | auth.me のみ＋tenant 無 🔴 |
| 20 | `startExecutiveAvatarSession` | LiveAvatar セッション開始 | `clientCompanyId, avatarProfileId, purpose, scenarioId, mode` | auth.me + consent + active 🔴 (tenant 無) |
| 21 | `stopExecutiveAvatarSession` | LiveAvatar セッション終了＋課金記録 | `avatarConversationSessionId` | auth.me のみ 🔴 |
| 22 | `syncExecutiveAvatarContext` | LiveAvatar Context 同期 | `clientCompanyId, avatarProfileId` | auth.me + consent 🔴 (tenant 無) |

---

## 4. Gemini API 連携

| Function | モデル | API Key 取得 | 評価 |
|---|---|---|---|
| `askCompanyBrain` | `gemini-2.0-flash` ハードコード（`entry.ts:354`） | `Deno.env.get("GEMINI_API_KEY")` | 🟡 モデル名のみハードコード（他関数は `GEMINI_MODEL` 環境変数尊重） |
| `debugExecutiveBrainIntegration` | `Deno.env.get("GEMINI_MODEL") \|\| "gemini-2.0-flash"`（`:33`） | `Deno.env.get("GEMINI_API_KEY")`（`:32`） | 🟢 |
| `evaluateAvatarTrainingSession` | 同上（`:44`） | 同上（`:43`） | 🟢 |
| `reviewWorkWithExecutiveBrain` | 同上（`:60`） | 同上（`:59`） | 🟢 |
| `syncExecutiveAvatarContext` | 同上（`:117`） | 同上（`:116`） | 🟢 |
| `startExecutiveAvatarSession` | （取得のみ、TEXT_FALLBACK 用） | 同上（`:91`） | 🟡 dead 取得 |
| `aiChat` | （Gemini 直叩きなし。`base44.asServiceRole.integrations.Core.InvokeLLM` 経由） | Base44 内部 | 🟢 |

呼び出し方式: いずれも `?key=${geminiKey}` の URL クエリパラメータ。Header 認証推奨。

🟢 フロントから Gemini 直接呼出: **0 件**（`generativelanguage` / `googleapis.com` の grep 結果は CSS フォントのみ）。

---

## 5. HeyGen API 連携

| Function | エンドポイント | API Key | 評価 |
|---|---|---|---|
| `checkHeygenLipsync` | `GET https://api.heygen.com/v3/lipsyncs/{jobId}` (`:27`) | `Deno.env.get("HEYGEN_API_KEY")` (`:20`) | 🟢 |
| `createHeygenLipsync` | `POST https://api.heygen.com/v3/lipsyncs` (`:93`) | 同上 (`:87`) | 🟢 |
| `createExecutiveAvatarFromSourceVideo` | `POST https://api.heygen.com/v1/digital_twins` (`:54`) | 同上 (`:51`) | 🟢 |
| `debugExecutiveBrainIntegration` | `GET https://api.heygen.com/v1/avatars` (`:132`) | 同上 (`:34`) | 🟢 |
| `syncExecutiveAvatarContext` | （取得のみ、未使用 dead code: `:165`） | 同上 | 🟡 |

🟢 フロントから HeyGen 直接呼出: **0 件**。

---

## 6. ExecutiveBrain Avatar 関連実装

### 関連 Backend Function
- `createExecutiveAvatarFromSourceVideo`（HeyGen Digital Twin 作成）
- `registerAvatarProviderIds`（HeyGen/LiveAvatar ID 登録）
- `syncExecutiveAvatarContext`（Context 同期）
- `startExecutiveAvatarSession` / `stopExecutiveAvatarSession`（LiveAvatar セッション制御）
- `fetchExecutiveAvatarTranscript`（Transcript 取得）
- `createRecordedExecutiveAvatarVideo`（録画動画生成）
- `evaluateAvatarTrainingSession`（研修評価 by Gemini）
- `reviewWorkWithExecutiveBrain`（仕事レビュー by Gemini）
- `checkExecutiveAvatarUsageLimit`（プラン制限チェック）
- `debugExecutiveBrainIntegration`（診断）
- `createExecutiveBrainDemoData` / `createExecutiveBrainSampleData` / `createDemoExecutiveBrainData`（デモデータ）

### 関連画面と consent チェック状況
| 画面 | 呼ぶ Function | フロント consent チェック |
|---|---|---|
| ExecutiveAvatarManagement | `syncExecutiveAvatarContext`, `debugExecutiveBrainIntegration` | バナー表示のみ（`:88, 102-112`） |
| AvatarConsentRegistration | （`asServiceRole` 直叩き 🔴） | 承認ボタンのみ admin/softdoing_admin/client_admin 限定 |
| AvatarCreationSetup | `debugExecutiveBrainIntegration`, `syncExecutiveAvatarContext`, `startExecutiveAvatarSession` | 🔴 なし |
| AvatarContextSync | `syncExecutiveAvatarContext` | scope warning のみ。consent 未確認 |
| AvatarConsultationRoom | `startExecutiveAvatarSession`, `askCompanyBrain` | 🟡 リスト時のみ `consentStatus: "approved"` filter（`:38-42`） |
| NewEmployeeTraining | `start/stop ExecutiveAvatarSession`, `askCompanyBrain`, `evaluateAvatarTrainingSession` | 🔴 なし |
| WorkReviewPage | `reviewWorkWithExecutiveBrain` | 🟡 リスト filter のみ（`:43-46`） |
| ExecutiveBrainDemo | `createExecutiveBrainDemoData`, `startExecutiveAvatarSession` | 🔴 なし |
| ExecutiveBrainDiagnostics | `debugExecutiveBrainIntegration` | 表示のみ |
| ExecutiveBrainPreLaunchTest | （Entity 直接 count） | revoke 数を NG 判定 |
| AvatarUsageStats | （Function なし） | プランで赤バナー表示のみ |
| SessionLogs | （Function なし、Entity 直叩き） | 🔴 ロール / consent チェック皆無 |

🔴 フロントの consent チェックは「リストに出さない」程度。URL 直打ち（`/avatar-consultation` で querystring）や DevTools での `avatarProfileId` 改変で承認外 avatar に対し start を発射可能（Backend で関数によって有/無）。

---

## 7. APIキーがフロントエンドに出ていないか

🟢 **API キー直接露出: 0 件**。
- `VITE_GEMINI_*` `VITE_HEYGEN_*` `VITE_OPENAI_*` `VITE_ANTHROPIC_*` `VITE_GOOGLE_*` の grep ヒット: **0**
- `sk-` / `AIza` プレフィックス grep: **0**
- `import.meta.env` 参照は `src/lib/app-params.js:43, 46, 47` のみ（`VITE_BASE44_APP_ID`、`VITE_BASE44_FUNCTIONS_VERSION`、`VITE_BASE44_APP_BASE_URL` の 3 つ。シークレットではない）
- `.env.local` 内容も `VITE_BASE44_APP_ID` `VITE_BASE44_APP_BASE_URL` の 2 行のみ
- `fetch(` 直叩き: src 全体で **0 件**

🟢 Backend Function 内も全キーが `Deno.env.get("...")` 経由。`import.meta.env.VITE_*` の参照は **0 件**。

🟡 「GEMINI_API_KEY」「HEYGEN_API_KEY」の文字列出現は `pages/ExecutiveBrainDiagnostics.jsx:90, 97, 325, 331` と `pages/ExecutiveBrainPreLaunchTest.jsx:65, 66` の **ラベル表示用**のみ。値ではない。

---

## 8. asServiceRole で権限確認が先に行われているか

`base44.asServiceRole.entities.*` / `asServiceRole.integrations.*` を呼ぶ Function 一覧と、テナント検証順序。

### 🟢 模範実装
- **`aiChat`**: `:39-43` で `businessRole` を `SCOPE_ALLOWED_ROLES` で照合、`:46-48` で `userCompanyId === clientCompanyId`（softdoing_admin 以外）を必ず通過してから `:56-69` の `asServiceRole.entities.filter` を実行。

### 🟡 順序逆転
- **`askCompanyBrain`**: テナント検証（`:181-193`）より前に `ClientCompany.get`（`:159`）、`ConversationLog.filter`（`:169-172`）、`UsageRecord.create`（`:196-204`）を実行。403 で止まる前に他社情報の取得・課金記録の作成が走る。**順序入れ替え必要**。

### 🔴 テナント分離欠如（13 関数）
攻撃者が `clientCompanyId` / `videoProjectId` / `avatarProfileId` / `avatarConversationSessionId` を渡せば、他社データを読み書き可能。

| Function | リスク |
|---|---|
| `checkHeygenLipsync` | 他社 VideoProject の status / outputVideoUrl 上書き（`:14, :59`） |
| `createHeygenLipsync` | 他社 VideoProject に HeyGen 課金トリガー（`:14, :43, :77, :128`） |
| `createExecutiveAvatarFromSourceVideo` | 他社 avatar の status / job 改変（`:15, :70, :94, :113`） |
| `createRecordedExecutiveAvatarVideo` | 他社 avatar で録画 VideoProject 作成（`:30, :44, :53, :70`）＋consent 未検証 🔴🔴 |
| `generateSpeech` | 他社 VideoProject に OpenAI TTS 課金トリガー（`:16, :53, :64`）＋プラン無 |
| `generateVideoScript` | 他社の OpenAI 台本生成課金＋他社 VideoProject 作成（`:20, :199, :210`） |
| `registerAvatarProviderIds` | 他社 avatar の provider IDs 上書き（なりすまし） （`:24, :63`） |
| `reviewWorkWithExecutiveBrain` | 他社 avatar/ナレッジ参照で Gemini 呼出＋他社 Review 書込（`:37, :150, :170`） |
| `startExecutiveAvatarSession` | 他社 avatar で LiveAvatar 課金セッション開始（`:42, :169, :212`） |
| `stopExecutiveAvatarSession` | 他社セッション強制終了＋課金記録捏造（`:19, :76, :83`） |
| `syncExecutiveAvatarContext` | 他社 avatar の Context Prompt 生成（Gemini）＋他社 profile 更新（`:19, :205`） |
| `evaluateAvatarTrainingSession` | 他社セッション取得＋評価書込（`:15, :140`） |
| `fetchExecutiveAvatarTranscript` | 他社セッション transcript 取得＋上書き（`:18, :50`） |

### 🟡 リードオンリーだが情報漏洩リスク
- `checkExecutiveAvatarUsageLimit`、`checkPlanLimits`、`checkUsageLimit`、`debugExecutiveBrainIntegration`：他社の利用量・プラン・avatar/会社情報を覗き見可能。

### 🟡 admin 限定だが clientCompanyId は任意
- `createDemoExecutiveBrainData`、`createExecutiveBrainDemoData`、`createExecutiveBrainSampleData`：`role==='admin'` チェックあり。任意の他社にデモデータ書き込み可能（運用上 OK の可能性あるが、要確認）。

### 修正方針
各 entity 取得後、`record.clientCompanyId === user.clientCompanyId` または `softdoing_admin` をチェックし、不一致なら 403。`asServiceRole` を使う直前に必ずユーザー権限/テナント整合チェックを置く。

---

## 9. consentStatus=approved 検証

| Function | チェック | 評価 |
|---|---|---|
| `createExecutiveAvatarFromSourceVideo` | `:20-25` `consentStatus !== "approved"` で 403 | 🟢 |
| `startExecutiveAvatarSession` | `:59-66` 同上 | 🟢 |
| `syncExecutiveAvatarContext` | `:24-29` 同上 | 🟢 |
| `registerAvatarProviderIds` | `:29-34` 同上 | 🟢 |
| `reviewWorkWithExecutiveBrain` | `:38` `consentStatus !== "approved" \|\| status !== "active"` | 🟢 |
| **`createRecordedExecutiveAvatarVideo`** | **`:35-40` `status === "active"` のみ。consentStatus 未検証** | **🔴 重大** |
| `evaluateAvatarTrainingSession` | 未実施 | 🟡（評価のみだが要明示） |
| `fetchExecutiveAvatarTranscript` | 未実施 | 🟡 |
| `stopExecutiveAvatarSession` | 未実施 | 🟡（停止は救済操作とも解釈可） |

🔴 最重要: **`createRecordedExecutiveAvatarVideo`** で consent 未承認の本人の声・姿で録画動画が生成されうる。`status="active"` は別フローで設定されるため抜け道。

🟡 フロント側のチェックは「`consentStatus === "approved"` の avatar のみリストに出す」程度（AvatarConsultationRoom, WorkReviewPage）。リストから外れていても URL/Payload 改変で他 avatar の ID を渡せる前提で Backend ガードが必須。

---

## 10. public / internal / executive / admin_only の情報分離

### Backend での分離
| Function | 分離方法 | 評価 |
|---|---|---|
| `aiChat` | `SCOPE_ALLOWED_ROLES` で role×scope マトリクス。channel→requiredScope→allowed roles 検証＋ KnowledgeSource を `audienceScope` で filter（`:4-9, 41-43, 73-78, 137-148`） | 🟢 模範 |
| `askCompanyBrain` | `getAllowedScopes(role, channel)` で channel ごとの allowed scopes、KnowledgeChunk と AnswerPolicy を filter（`:31-54, 243-247, 255-260`） | 🟢 |
| `generateVideoScript` | `audienceScope: "public"` のみ参照（`:100-104`） | 🟢（社外向けなので妥当） |
| `syncExecutiveAvatarContext` | `allowedScopes` map で profile.audienceScope に基づき filter（`:51-59`） | 🟢（executive で admin_only は意図的除外） |
| **`reviewWorkWithExecutiveBrain`** | **KnowledgeChunk を scope 未指定で filter**（status=approved のみ）（`:53-56`） | **🔴 admin_only も Gemini プロンプトに流入** |
| **`evaluateAvatarTrainingSession`** | **同上（scope 未指定）**（`:37-40`） | **🔴 admin_only が研修評価に流入の可能性** |

### Frontend での分離
| 画面 | channel 値 | 評価 |
|---|---|---|
| PublicAIPreview | `"public"`（`:55`）＋フロントでも明示 filter（`:33-40`） | 🟢 |
| InternalAIChat | `"internal"`＋category 任意（`:70`） | 🟢 |
| ExecutiveAIChat | `"executive"`＋プロンプト整形後送信（`:122`） | 🟢 |
| AIChat | `mode` 値（`public`/`internal`/`executive`/**`admin_test`**）（`:62`）。`MODES` 配列でフロントから自由に選択可（`:24`） | 🟡 admin_test を一般ユーザーが選べる |

🔴 Sidebar はロール/プラン出し分けゼロ。viewer / employee からも管理メニュー・経営指標・公開前テストのリンクが見える。

---

## 11. Light / Standard / Professional プラン制限が Backend でも効いているか

### プラン上限値定義の重複
6 ファイルでハードコード重複: `checkPlanLimits:3-32`, `checkUsageLimit:3-32`, `checkExecutiveAvatarUsageLimit:26-53`, `askCompanyBrain:152-157`, `createHeygenLipsync:32-37`, `generateVideoScript:29-34`。共通モジュール化必須。

### Backend での強制チェック状況
| Function | プラン制限チェック | 評価 |
|---|---|---|
| `aiChat` | **未実施** | 🔴 |
| `askCompanyBrain` | 自前ハードコード（`:159-179, 222-233`） | 🟡（共通化推奨） |
| `generateSpeech` | **未実施** | 🔴（OpenAI TTS 無制限呼出可能） |
| `generateVideoScript` | 自前（`:29-98`） | 🟡 |
| `createHeygenLipsync` | 自前（`:32-75`） | 🟡 |
| `createRecordedExecutiveAvatarVideo` | `checkExecutiveAvatarUsageLimit` invoke（`:15-21`） | 🟢 |
| `startExecutiveAvatarSession` | 同上（`:27-32`） | 🟢 |
| `reviewWorkWithExecutiveBrain` | 同上（`:22-27`） | 🟢 |
| `syncExecutiveAvatarContext` | **未実施** | 🔴 |
| `evaluateAvatarTrainingSession` | **未実施** | 🔴 |
| `createExecutiveAvatarFromSourceVideo` | **未実施** | 🔴（HeyGen Digital Twin は超高コスト） |
| `fetchExecutiveAvatarTranscript` | 未実施 | 🟡（軽量とも言える） |
| `stopExecutiveAvatarSession` | 未実施 | 🟡（終了処理） |

### Frontend ではプラン警告のみ（機能ロックなし）
- UsageAndBilling/PricingPlans/AvatarUsageStats/ExecutiveBrainPreLaunchTest はプラン値を読んで赤バナー表示するが、ボタンや遷移は無効化していない。フロントから止められない。
- ScriptGenerator, AudioGenerator, LipsyncGenerator, VideoUploader, AvatarConsultationRoom, NewEmployeeTraining, WorkReviewPage, AIChat 系はプランガード一切なし。

---

## 12. その他の重大指摘

### 🔴 CLIENT_ID のハードコード
- 27 画面中 27 が `const CLIENT_ID = "..."` を即値で持つ。
- 5 画面が古い `"demo-company-001"`、22 画面が `"69fc3d9af68187d823c1a41b"` で**ID 不一致**。
- KnowledgeUpload (`demo-company-001`) で登録 → AIChat (`69fc...`) で参照不可、というテナント横断バグの温床。
- 本番では `useAuth().user.clientCompanyId` を使うべき。

### 🔴 `AdminUserSettings` での自己ロール昇格
- `pages/AdminUserSettings.jsx:51` で `base44.auth.updateMe(form)` を**ロール検証なし**で呼ぶ。
- `form` には `businessRole` `clientCompanyId` を含む。ユーザーが自身を `softdoing_admin` に昇格、または別の `clientCompanyId` に切り替え可能。
- Base44 SDK / Backend 側のフィールド権限制御が無い場合、**権限昇格脆弱性**。

### 🔴 `AvatarConsentRegistration` の `asServiceRole` 直叩き
- `pages/AvatarConsentRegistration.jsx:76, 95, 103` で `base44.asServiceRole.integrations.Core.UploadPrivateFile` / `entities.ExecutiveAvatarProfile.update` / `entities.AvatarConsentAuditLog.create`。
- フロントから serviceRole を発射可能だと監査ログの actionBy も含めて偽装可能。Backend Function 経由に変更すべき。

### 🔴 `ChatInterface.jsx`（dead code）の直 LLM 呼び出し
- `src/components/chat/ChatInterface.jsx:59` で `base44.integrations.Core.InvokeLLM` を直接呼び、`buildContext()`（`:34-53`）で knowledge 全件をフロントで filter（`scope === "all" || scope === mode`）してプロンプトに埋め込む。
- バックエンドのスコープ強制が効かない。
- どの画面からも import されていない（dead）が、削除推奨。

### 🔴 `ProtectedRoute` 未適用
- `src/components/ProtectedRoute.jsx:12` 定義済みだが、`App.jsx` で import すらされていない。
- `App.jsx:57-87` の全 25 ルートが裸。認証ガードは `AuthenticatedApp` 全体レベル（`auth_required` で `navigateToLogin`）のみで、ロール/プラン/consent ガードは画面内手動実装に依存。

### 🔴 SessionLogs の閲覧
- `pages/SessionLogs.jsx` はロール/consent チェックなしで全社員のアバター会話本文を読める実装。

### 🟡 その他
- `Sidebar.jsx` の dead リンク 3 件（`/video-studio`, `/videos`, `/settings`）。
- `Sidebar` から `PricingPlans` `Diagnostics` への導線なし。
- `lib/PageNotFound.jsx:13` で `auth.me()` を直叩き（AuthContext を経由していない、重複呼出）。
- `src/api/base44Client.js:12` の `requiresAuth: false` 設定の妥当性は要検討。

---

## 13. 重大度サマリ（本番化前の優先度）

### 🔴 P0（即時対応必須）
1. **テナント分離欠如**：13 Function で `asServiceRole` 利用時に `userCompanyId === clientCompanyId` を未検証。クロステナントで読み書き可能。
2. **`createRecordedExecutiveAvatarVideo` の consent 未検証**。
3. **`AdminUserSettings` での自己ロール昇格**。
4. **CLIENT_ID ハードコード（27 箇所）＋ ID 不一致**。
5. **`generateSpeech` / `aiChat` / `syncExecutiveAvatarContext` / `evaluateAvatarTrainingSession` / `createExecutiveAvatarFromSourceVideo` のプラン制限チェック欠如**（フロントでも止めていないため無制限課金 API 呼出可能）。
6. **`reviewWorkWithExecutiveBrain` / `evaluateAvatarTrainingSession` のスコープフィルタ欠如**（admin_only ナレッジが Gemini プロンプトに流入）。
7. **`ChatInterface.jsx`（dead code）の削除**。
8. **`AvatarConsentRegistration` の `asServiceRole` 直叩きを Backend Function 化**。
9. **ProtectedRoute 全画面適用（roles / plan / consent ガード）**。
10. **Sidebar のロール/プラン出し分け**。
11. **`ExecutiveBrainDiagnostics` `PricingPlans` のルート登録 or 削除判断**。

### 🟡 P1（本番後すぐ対応）
- `askCompanyBrain` のテナント検証順序逆転。
- `checkPlanLimits` / `checkUsageLimit` / `checkExecutiveAvatarUsageLimit` / `debugExecutiveBrainIntegration` のテナント検証追加。
- プラン上限値の共通モジュール化（6 ファイル重複解消）。
- `askCompanyBrain` の `gemini-2.0-flash` ハードコード解消（環境変数化）。
- `syncExecutiveAvatarContext:165` の dead code（`HEYGEN_API_KEY` 取得後未使用）削除。
- AIChat の `admin_test` モードを admin/softdoing_admin のみに限定。
- Sidebar の dead リンク 3 件解消。
- `PageNotFound` の auth 直叩きを AuthContext 経由に。
- `base44Client.js` `requiresAuth: false` の再評価。

### 🟢 OK（現状維持）
- API キーのフロント露出: 0 件。
- `import.meta.env` 参照は安全な Base44 識別子のみ。
- 外部 LLM/動画 API への直 fetch なし。
- `aiChat` のロール×スコープ×テナント分離は模範実装。
- 大半のアバター系で `consentStatus === "approved"` 確認済み。
- ログ出力時のキー sanitize 実装あり。

---

## 付録 A: 主要ファイル参照

- ルーティング: `src/App.jsx:57-87`
- 認証コンテキスト: `src/lib/AuthContext.jsx:21-115`
- ProtectedRoute（未使用）: `src/components/ProtectedRoute.jsx:12`
- Base44 クライアント: `src/api/base44Client.js:7-14`
- アプリ識別子取得: `src/lib/app-params.js:37-49`
- Sidebar 静的ナビ: `src/components/layout/Sidebar.jsx:11-66`
- フロント直 LLM（dead）: `src/components/chat/ChatInterface.jsx:34-79`
- 自己ロール昇格懸念: `src/pages/AdminUserSettings.jsx:50-56`
- `asServiceRole` 利用（Frontend）: `src/pages/AvatarConsentRegistration.jsx:74-115`
- プラン制限定数: `src/pages/UsageAndBilling.jsx:11-36`, `src/pages/AvatarUsageStats.jsx:11-36`, `src/pages/PricingPlans.jsx:13-91`

## 付録 B: Backend Function 環境変数一覧

| Function | 取得キー |
|---|---|
| `askCompanyBrain` | `GEMINI_API_KEY` |
| `checkHeygenLipsync` | `HEYGEN_API_KEY` |
| `createExecutiveAvatarFromSourceVideo` | `HEYGEN_API_KEY` |
| `createHeygenLipsync` | `HEYGEN_API_KEY` |
| `debugExecutiveBrainIntegration` | `GEMINI_API_KEY`, `GEMINI_MODEL`, `HEYGEN_API_KEY`, `LIVEAVATAR_API_KEY` |
| `evaluateAvatarTrainingSession` | `GEMINI_API_KEY`, `GEMINI_MODEL` |
| `fetchExecutiveAvatarTranscript` | `LIVEAVATAR_API_KEY` |
| `generateSpeech` | `OPENAI_API_KEY` |
| `generateVideoScript` | `OPENAI_API_KEY`, `OPENAI_MODEL` |
| `reviewWorkWithExecutiveBrain` | `GEMINI_API_KEY`, `GEMINI_MODEL` |
| `startExecutiveAvatarSession` | `LIVEAVATAR_API_KEY`, `GEMINI_API_KEY` |
| `stopExecutiveAvatarSession` | `LIVEAVATAR_API_KEY` |
| `syncExecutiveAvatarContext` | `GEMINI_API_KEY`, `GEMINI_MODEL`, `LIVEAVATAR_API_KEY`, `HEYGEN_API_KEY` |

すべて `Deno.env.get(...)` 経由。`import.meta.env.VITE_*` の参照は **0 件**。
