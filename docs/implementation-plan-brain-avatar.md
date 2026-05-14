# CompanyBrain AI 段階的実装計画

| 項目 | 内容 |
|---|---|
| 基準 | `docs/product-redesign.md` の 10 ステップジャーニー |
| Phase 1 | Brain Builder MVP（TEXT_FALLBACK） |
| Phase 2 | Avatar 接続（HeyGen / LiveAvatar） |
| Phase 3 | 業務展開（研修・レビュー・成長） |

凡例: ⏱=工数 / 🔴=重要 / 🟡=注意

---

## Phase 1: Brain Builder MVP（TEXT_FALLBACK 版）

> **目的**: LiveAvatar 未接続でも、「人物登録 → 同意 → 活用方法 → テキスト Brain Interview → 方針候補 → 人間承認 → 正式 Knowledge」までの体験を完成させる。

### 1.1 新規 Entity（6 件）

| Entity | required | 主要フィールド |
|---|---|---|
| `BrainPerson` | clientCompanyId, fullName | roleTitle, department, expertiseDomain, strengthFields[], speakingStyle, valuesNote, internalUseAllowed, externalUseAllowed, status, notes |
| `BrainSourceAsset` | clientCompanyId, brainPersonId, assetType, fileUri | originalFileName, sizeBytes, durationSeconds, mimeType, uploadedBy, uploadedAt |
| `BrainConsentRecord` | clientCompanyId, brainPersonId, consentStatus | consentScope, purposeNote, allowedUseCases[], forbiddenUseCases[], consentExpiresAt, consentFileUri, revocationReason, actedBy, actedByRole, previousStatus, newStatus |
| `BrainUseCase` | clientCompanyId, brainPersonId, useCaseType | priority, customNote, defaultQuestionTemplateKey |
| `BrainInterviewSession` | clientCompanyId, brainPersonId, useCaseId, mode, status | startedAt, completedAt, turnCount, transcriptJson, extractedAt, extractionStatus |
| `BrainPolicyCandidate` | clientCompanyId, brainPersonId, brainInterviewSessionId, category, draftText, status | title, sourceTurnIndexes[], suggestedAudienceScope, reviewerNote, reviewedBy, reviewedAt, approvedKnowledgeChunkId |

### 1.2 新規 Backend Function（2 件）

| Function | 役割 | 入力 | 出力 |
|---|---|---|---|
| `extractBrainPolicyCandidates` | BrainInterviewSession の transcript から Gemini で方針候補を抽出 | `clientCompanyId, brainInterviewSessionId` | `{ candidates: BrainPolicyCandidate[] }`（draft 状態で保存） |
| `approveBrainPolicyCandidate` | 承認した方針候補を KnowledgeSource + KnowledgeChunk として登録 | `clientCompanyId, brainPolicyCandidateId, audienceScope, reviewerNote` | `{ knowledgeChunkId, knowledgeSourceId }` |

両 Function とも `docs/security-hardening.md` の共通テンプレ（auth.me / assertTenantAccess / jsonError / consentStatus 確認）を踏襲。

### 1.3 新規 Frontend 画面（6 件）

| 画面 | ルート | 主要操作 |
|---|---|---|
| `BrainBuilderHome` | `/brain-builder` | 全 BrainPerson 一覧、新規作成ボタン、各 Person の進捗ステップ表示 |
| `BrainPersonRegistration` | `/brain-builder/persons/new`, `/brain-builder/persons/:personId/edit` | 氏名・役職・担当領域・話し方・価値観の登録 |
| `BrainSourceConsentUpload` | `/brain-builder/persons/:personId/consent` | 動画/音声/同意書アップロード、同意ステータス変更（approve/revoke） |
| `BrainUseCaseWizard` | `/brain-builder/persons/:personId/use-cases` | 10 種の活用方法から複数選択 |
| `BrainInterview` | `/brain-builder/persons/:personId/interview/:sessionId?` | テキストチャット型インタビュー、完了時に `extractBrainPolicyCandidates` 呼出 |
| `BrainPolicyReview` | `/brain-builder/persons/:personId/policies` | 候補を category 別に表示、承認/却下、承認時に `approveBrainPolicyCandidate` 呼出 |

### 1.4 既存ファイル変更

| ファイル | 変更内容 |
|---|---|
| `src/App.jsx` | 6 ルートを追加（既存ルートは触らない） |
| `src/components/layout/Sidebar.jsx` | 「Brain Builder」グループを「概要」直下に追加 |

### 1.5 Phase 1 のスコープ外（明示）

- LiveAvatar / HeyGen 接続（Brain Interview は **テキストのみ**）
- BrainAvatarProfile / BrainConsultationSession / BrainWorkReview Entity 統合
- Knowledge Graph 可視化
- 完成度スコアの厳密化（最初は単純な % 計算）
- 同意撤回の即時利用停止フロー（既存 ExecutiveAvatar 系で実装済みなので、Brain 系は Phase 2 で）

### 1.6 Phase 1 リスク

| リスク | 対策 |
|---|---|
| 🔴 既存機能を壊さない | 全て新規ファイルで追加。既存 Function / Entity / Page は無変更。App.jsx・Sidebar のみ追記 |
| 🔴 CLIENT_ID ハードコード問題 | 既存パターンを踏襲（`useAuth` 移行は Phase 2 の全体タスク。Phase 1 だけ別実装にすると一貫性が崩れるため） |
| 🟡 Gemini プロンプトの方針抽出精度 | 初期は `category` 別に分けたシステムプロンプトを試行。プロンプト改善は Phase 1 後に実測 |
| 🟡 KnowledgeSource を 1 セッション 1 件作るか | Phase 1 では「1 BrainInterviewSession = 1 KnowledgeSource」を採用。Phase 2 で Person 単位に集約検討 |

---

## Phase 2: Avatar 接続（HeyGen / LiveAvatar 統合）

> **目的**: BrainPerson のアバターを HeyGen / LiveAvatar と紐付け、リアルタイム会話で Brain Interview を実施できるようにする。

### 2.1 Entity 統合

- `BrainAvatarProfile` 新規 → 既存 `ExecutiveAvatarProfile` と 1:1 リレーション or 段階的統合
- `BrainConsultationSession` 新規 → 既存 `AvatarConversationSession` と互換維持
- `BrainPerson.brainAvatarProfileId` リレーション追加

### 2.2 新規 Backend Function

| Function | 役割 |
|---|---|
| `linkBrainPersonToAvatar` | BrainPerson に既存 ExecutiveAvatarProfile を紐付け（or 新規作成） |
| `startBrainInterviewLive` | LiveAvatar セッション開始 + BrainInterviewSession を `mode="live_avatar"` で作成 |
| `syncBrainContext` | BrainPerson + 承認済み Brain Knowledge を Context Prompt として LiveAvatar に同期 |

### 2.3 新規 Frontend 画面

| 画面 | 役割 |
|---|---|
| `BrainAvatarSetup` | アバター作成 / ID 登録（HeyGen Digital Twin API 補助 + 手動 ID 登録） |
| `BrainKnowledgeGraph` | 承認済み Brain Knowledge をカテゴリ別に可視化（理念/判断基準/教育方針/...） |
| `BrainInterview` 拡張 | `mode="live_avatar"` 切替（フォールバックとしてテキスト維持） |

### 2.4 セキュリティ強化（横展開）

`docs/security-hardening.md` の残課題：
- `aiChat` プラン制限追加
- `generateSpeech` テナント分離・プラン制限
- `evaluateAvatarTrainingSession` テナント分離・スコープフィルタ
- `fetchExecutiveAvatarTranscript` テナント分離
- `stopExecutiveAvatarSession` テナント分離
- `registerAvatarProviderIds` テナント分離
- `checkHeygenLipsync` テナント分離

### 2.5 フロントエンド全体強化（横展開）

- `ProtectedRoute` 全画面適用
- `Sidebar` のロール別出し分け
- `AdminUserSettings` の自己ロール昇格防止
- CLIENT_ID ハードコード → `useAuth().user.clientCompanyId` 置換
- `AvatarConsentRegistration` の `asServiceRole` 直叩きを Backend Function 化
- `ChatInterface.jsx` (dead code) 削除
- App.jsx 未登録の `ExecutiveBrainDiagnostics` `PricingPlans` 整理

---

## Phase 3: 業務展開

> **目的**: Brain を業務（新人研修・仕事レビュー・営業ロールプレイ・顧客対応）に組み込み、利用ログから継続的に成長させる。

### 3.1 機能

| 機能 | 説明 |
|---|---|
| `BrainTrainingScenario` 統合 | 既存 AvatarTrainingScenario を BrainPerson 軸で再構成 |
| `BrainTrainingEvaluation` | 研修後評価（理念理解/判断基準/対応姿勢/リスク認識/次に学ぶこと） |
| `BrainWorkReview` 統合 | 既存 WorkReviewRequest を Brain 軸で再構成 |
| `BrainGrowthSuggestion` | 会話・レビュー・研修ログから改善候補抽出（人間承認後 Knowledge 化） |
| Brain 完成度スコア v2 | 重み付け式（同意 20%, 活用 10%, インタビュー回数 25%, 承認方針数 30%, 業務利用ログ 15%） |
| 公開前チェック | アバターを社外公開する前の 10 項目自動チェック |

### 3.2 Sales / Marketing

- 新キャッチコピー反映: 「企業人格のAIプラットフォーム — 会社の脳みそを、対話で育てる。」
- LP / Pricing ページの再設計

---

## 全体ロードマップ

```
Phase 1 (今回)         ━━━━━━━━━━ Brain Builder MVP（TEXT版）
Phase 2 (次回)                    ━━━━━━━━━━ Avatar 接続 + 全体安全強化
Phase 3 (将来)                              ━━━━━━━━━━ 業務展開 + 継続成長
                ↑
         ここで一旦リリース可能
         （アバター無しでも会社の脳みそが育つ）
```

---

## Phase 1 完了時の DoD

- [ ] 6 Entity が Base44 にデプロイされる（jsonc ファイル提供）
- [ ] 2 Backend Function が動作する（`extractBrainPolicyCandidates`, `approveBrainPolicyCandidate`）
- [ ] 6 画面が新ルートで開ける
- [ ] BrainPerson 1 件を作成 → 同意承認 → 活用方法選択 → 5 ターン以上のインタビュー → 候補 3 件以上抽出 → 1 件承認 → KnowledgeChunk が `audienceScope=internal, status=approved` で生成される、までを E2E で確認できる
- [ ] `npm run build` が成功する
- [ ] 既存 25 ルート全てが従前通りアクセス可能
