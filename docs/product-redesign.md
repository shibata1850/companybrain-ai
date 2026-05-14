# CompanyBrain AI 製品再設計仕様書

> **CompanyBrain AI** — 企業人格のAIプラットフォーム
> *会社の脳みそを、対話で育てる。*

| 項目 | 内容 |
|---|---|
| 実施日 | 2026-05-07 |
| 対象 | アプリ全体の方向転換（資料登録型 → 対話育成型） |
| 関連 | `docs/architecture-audit.md`、`docs/security-hardening.md`、`docs/implementation-plan-brain-avatar.md` |

---

## 1. 製品コンセプト

### 1.1 一行定義

> **CompanyBrain AIは、経営者・上司・熟練社員の動画と声をもとにAIアバターを作成し、そのアバターとの対話を通じて、会社の判断基準・教育方針・営業方針・顧客対応方針を蓄積・整理・承認し、属人化を防ぐ「会社の脳みそ」を育てるAIエージェントアバターシステムです。**

### 1.2 これまでとの違い

| | 旧コンセプト | 新コンセプト |
|---|---|---|
| 起点 | 会社資料を登録する | **会社の脳みそとなる人物を登録する** |
| 中核 | AIが資料から回答する | **アバターと対話して方針を結晶化する** |
| 学習 | AIが資料を学習 | **対話 → 方針候補 → 人間承認 → 正式Brain** |
| 価値 | 既存マニュアルの検索 | **属人化された判断基準・教育方針・対応方針の資産化** |

### 1.3 提供する価値

1. **属人化を防ぐ** — 「社長しか分からない」「部長しか判断できない」「ベテランしか教えられない」を「会社として承認された判断基準・教育方針・対応ルール」へ
2. **社長・上司の考え方を継承できる** — 話し方・考え方・判断の順番まで残す（事業承継・地方/中小企業に強い）
3. **新人研修が対話型になる** — アバターに「この場合どう判断すれば？」「なぜその対応が大事？」と聞ける
4. **仕事レビューに使える** — 営業メール・提案書・顧客返信・報告書を会社方針でチェック

### 1.4 LiveAvatar / HeyGen の前提（重要）

- **HeyGen**: 実在人物の動画から Digital Twin を作る API あり（`POST /v1/digital_twins`）
- **LiveAvatar**: アバター作成自体は **API 経由ではなくプラットフォーム上で行う**（公式 FAQ）。リアルタイム会話は Sessions / Contexts / Transcripts API で構成可能（FULL Mode = LiveAvatar 側 LLM、LITE Mode = 持ち込み LLM/TTS/ASR）
- **設計上の帰結**: アプリ内では「**動画・音声・同意管理 → アバター作成依頼 / ID 登録 → リアルタイム会話接続**」の順序を維持。手動 ID 登録は必須残存

---

## 2. ユーザージャーニー（10ステップ）

```
Step 1  Brain Person 登録（会社の脳みそとなる人物）
Step 2  本人動画・音声・同意書アップロード
Step 3  HeyGen / LiveAvatar でアバター作成（手動 or API 補助）
Step 4  avatar_id / voice_id / context_id 登録
Step 5  活用目的を選択（新人研修 / 営業教育 / 顧客対応 / 事業承継 ...）
Step 6  Brain Interview 開始（テキスト or LiveAvatar）
Step 7  会話ログから方針候補を Gemini で抽出
Step 8  管理者が承認（承認のみ正式 Knowledge へ）
Step 9  CompanyBrain Knowledge に蓄積
Step 10 新人研修・仕事相談・文面レビュー・経営判断支援で活用
```

---

## 3. 情報設計（Entity）

### 3.1 新規 Entity（Phase 1 で必要な 6 件）

| Entity | 役割 | Phase |
|---|---|---|
| **BrainPerson** | 会社の脳みそとなる人物（代表者/役員/部門長/熟練社員）プロファイル | 1 |
| **BrainSourceAsset** | 本人動画・音声・同意書ファイル | 1 |
| **BrainConsentRecord** | 同意・撤回・有効期限の監査ログ | 1 |
| **BrainUseCase** | 活用方法の選択（新人研修 / 営業教育 など）と質問テンプレート | 1 |
| **BrainInterviewSession** | Brain Interview の対話セッションと完全な対話履歴 | 1 |
| **BrainPolicyCandidate** | 対話から抽出した方針候補（draft → approved → rejected） | 1 |

### 3.2 後続フェーズの Entity（Phase 2-3）

| Entity | 役割 | Phase |
|---|---|---|
| BrainAvatarProfile | アバター ID・状態（既存 ExecutiveAvatarProfile を統合 or 互換） | 2 |
| BrainConsultationSession | アバター相談セッション（既存 AvatarConversationSession を統合 or 互換） | 2 |
| BrainWorkReview | 仕事レビュー（既存 WorkReviewRequest を統合 or 互換） | 3 |
| BrainTrainingScenario | 研修シナリオ（既存 AvatarTrainingScenario を統合 or 互換） | 3 |
| BrainTrainingEvaluation | 研修評価結果 | 3 |
| BrainKnowledgeNode | 結晶化済み Knowledge をカテゴリ別に可視化 | 3 |
| BrainGrowthSuggestion | 会話・レビュー・研修ログから抽出する成長提案 | 3 |

### 3.3 既存 Entity との互換方針

| 既存 | 方針 |
|---|---|
| `ClientCompany` | 維持（変更なし） |
| `KnowledgeChunk` | **正式承認済みナレッジの最終形として維持**。Brain Interview から人間承認後に流入 |
| `KnowledgeSource` | 維持。`sourceType="interview"` を新規に増やす予定（Phase 1 では `manual` を流用） |
| `ExecutiveAvatarProfile` | 維持。Phase 2 で BrainAvatarProfile と統合 or 1:1 リレーション |
| `AvatarConversationSession` | 維持。Phase 2 で BrainConsultationSession と統合 |
| `WorkReviewRequest` | 維持。Phase 3 で BrainWorkReview と統合 |
| `UsageRecord` / `ConversationLog` | 維持 |
| `AvatarConsentAuditLog` | 維持。BrainConsentRecord と並行運用（Phase 4 で統合） |

### 3.4 主要 Entity のスキーマ概要（Phase 1）

#### BrainPerson
```
clientCompanyId, fullName, roleTitle, department, expertiseDomain,
strengthFields[], speakingStyle, valuesNote, internalUseAllowed,
externalUseAllowed, status (draft/active/archived), notes
```

#### BrainSourceAsset
```
clientCompanyId, brainPersonId, assetType (video/audio/consent_document),
fileUri, originalFileName, sizeBytes, durationSeconds, mimeType,
uploadedBy, uploadedAt
```

#### BrainConsentRecord
```
clientCompanyId, brainPersonId, consentStatus (pending/approved/revoked),
consentScope (internal/external/both), purposeNote, allowedUseCases[],
forbiddenUseCases[], consentExpiresAt, consentFileUri,
revocationReason, actedBy, actedByRole, previousStatus, newStatus
```

#### BrainUseCase
```
clientCompanyId, brainPersonId, useCaseType
  (new_employee_training / sales_education / customer_support /
   founder_judgment / succession / field_education / internal_rule /
   work_review / hiring_explanation / management_decision),
priority, customNote, defaultQuestionTemplateKey
```

#### BrainInterviewSession
```
clientCompanyId, brainPersonId, useCaseId, mode (text_chat/live_avatar),
status (in_progress/completed/abandoned), startedAt, completedAt,
turnCount, transcriptJson (full Q&A history),
extractedAt, extractionStatus (pending/completed/failed)
```

#### BrainPolicyCandidate
```
clientCompanyId, brainPersonId, brainInterviewSessionId,
category (decisionPolicy / educationPolicy / salesPolicy /
          customerSupportPolicy / escalationRules / forbiddenActions /
          trainingFAQ / workReviewCriteria / decisionExamples),
title, draftText, sourceTurnIndexes[], suggestedAudienceScope,
status (draft/approved/rejected), reviewerNote, reviewedBy, reviewedAt,
approvedKnowledgeChunkId
```

---

## 4. 画面設計

### 4.1 新規画面（Phase 1 で必要な 6 件）

| # | 画面 | ルート | 役割 |
|---|---|---|---|
| 1 | **BrainBuilderHome** | `/brain-builder` | Brain 作成の入口・全 Brain 一覧・進捗ステップ表示 |
| 2 | **BrainPersonRegistration** | `/brain-builder/persons/new` 等 | Brain Person を登録/編集 |
| 3 | **BrainSourceConsentUpload** | `/brain-builder/persons/:personId/consent` | 動画・音声・同意書アップロード + 同意管理 |
| 4 | **BrainUseCaseWizard** | `/brain-builder/persons/:personId/use-cases` | 活用方法の選択 |
| 5 | **BrainInterview** | `/brain-builder/persons/:personId/interview/:sessionId?` | テキストチャット型インタビュー |
| 6 | **BrainPolicyReview** | `/brain-builder/persons/:personId/policies` | 方針候補の承認/却下 |

### 4.2 後続フェーズの画面（Phase 2-3）

| 画面 | フェーズ |
|---|---|
| Brain Knowledge Graph（結晶化結果の可視化） | 2 |
| Brain Avatar 相談室（LiveAvatar 接続版） | 2 |
| 新人研修モード（シナリオ + 評価） | 3 |
| 仕事レビュー（Brain Avatar 統合版） | 3 |
| Brain 成長ログ（成長提案の承認） | 3 |
| Brain 完成度スコア・公開前チェック | 3 |

### 4.3 画面遷移（Phase 1）

```
BrainBuilderHome
  ├─ [新しい Brain Person を登録]
  │   → BrainPersonRegistration
  │       → 保存後 BrainSourceConsentUpload (この Person の)
  │           → 同意承認後 BrainUseCaseWizard
  │               → 選択完了後 BrainInterview
  │                   → 完了後 BrainPolicyReview
  │                       → 承認後 BrainBuilderHome（完成度↑）
  └─ [既存 Brain Person を選択]
      → 各画面に編集アクセス（Person カードの状態に応じて遷移先が変わる）
```

### 4.4 Sidebar 配置

新グループ **「Brain Builder」** を Sidebar の最上位（"概要" の直後）に追加：

```
- Brain Builder
  - Brain 作成 (BrainBuilderHome)         /brain-builder
  - 方針候補レビュー (BrainPolicyReview*)   /brain-builder/policies   ※ Person 横断版（Phase 2）
```

Phase 1 では「Brain 作成」エントリ 1 件のみ。詳細画面は Brain 作成画面から遷移。

### 4.5 UI 方針

- **トーン**: 高級感ある BtoB SaaS デザイン（既存に準拠）
- **左側に進捗ステップ**: 「人物登録 → 同意 → アバター → 活用方法 → インタビュー → 承認」
- **完成度スコア**: 各 Person カードに % で表示（同意/活用/インタビュー数/承認方針数の重み付け）
- **同意・承認・安全性の強調**: 同意未承認 Person はインタビュー導線をグレーアウト
- **「会社の脳みそが育っていく」感覚**: 承認した方針数を「Brain Knowledge ノード数」として表示

---

## 5. 安全設計

| 観点 | 方針 |
|---|---|
| API キー | フロントエンドに出さない（既存通り） |
| 本人同意 | `consentStatus !== "approved"` の Person はインタビュー・アバター利用不可 |
| AI ≠ 本人 | アバターは AI である旨を全画面に明示 |
| 最終判断 | 「最終判断は人間が行います」を全アバター応答末尾に付与 |
| スコープ分離 | 社外向けは public 承認済みのみ。internal/executive/admin_only を漏らさない |
| 方針承認フロー | **方針候補は draft で保存。client_admin / softdoing_admin が承認したものだけが KnowledgeChunk になる** |
| ログ保存 | 会話ログ・承認ログ・同意ログを永続保存 |
| 同意撤回 | `consentStatus="revoked"` で即時利用停止（既存 Backend Function 群でガード） |

---

## 6. アーキテクチャ全体像（Phase 1 完了時）

```
┌──────────────────────────────────────────────────────────────┐
│ Frontend (React + Vite)                                      │
│   src/pages/BrainBuilderHome.jsx                             │
│   src/pages/BrainPersonRegistration.jsx                      │
│   src/pages/BrainSourceConsentUpload.jsx                     │
│   src/pages/BrainUseCaseWizard.jsx                           │
│   src/pages/BrainInterview.jsx          (TEXT_FALLBACK only) │
│   src/pages/BrainPolicyReview.jsx                            │
└──────────────────────────────────────────────────────────────┘
                            │
                            │ base44.functions.invoke(...)
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ Backend Functions (Base44 / Deno)                            │
│   askCompanyBrain          (既存・対話エンジン流用)          │
│   extractBrainPolicyCandidates  ★新規 (Gemini 抽出)          │
│   approveBrainPolicyCandidate   ★新規 (KnowledgeChunk 化)    │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ Entities (Base44)                                            │
│   既存: ClientCompany, KnowledgeChunk, KnowledgeSource, ...  │
│   ★新規: BrainPerson, BrainSourceAsset, BrainConsentRecord,  │
│           BrainUseCase, BrainInterviewSession,               │
│           BrainPolicyCandidate                               │
└──────────────────────────────────────────────────────────────┘
```

### Phase 1 のデータフロー

```
[BrainPerson 作成]
    │
    └── BrainPerson record
            │
[同意書 + 動画/音声アップロード]
    │
    ├── BrainSourceAsset (video, audio, consent_document × 各 1)
    └── BrainConsentRecord (consentStatus="approved")
            │
[活用方法選択]
    │
    └── BrainUseCase (n 件)
            │
[Brain Interview - text mode]
    │
    ├── BrainInterviewSession (status="in_progress" → "completed")
    └── 各ターン: askCompanyBrain で AI 応答 + transcriptJson に蓄積
            │
[インタビュー完了 → 抽出]
    │
    └── extractBrainPolicyCandidates Function
        → Gemini に transcript を渡して category 別に方針候補を生成
        → BrainPolicyCandidate (status="draft") を n 件作成
            │
[管理者がレビュー]
    │
    └── 承認/却下
        ├── 却下: BrainPolicyCandidate.status = "rejected"
        └── 承認: approveBrainPolicyCandidate Function
                  ├── KnowledgeSource (sourceType="manual", title="Brain Interview - {Person名}") を 1 セッション 1 件作成（既存があれば再利用）
                  ├── KnowledgeChunk (status="approved") 作成
                  └── BrainPolicyCandidate.status = "approved" + approvedKnowledgeChunkId 紐付け
                          │
                          ▼
                  正式な Company Brain Knowledge として AI Chat / アバター相談で参照可能に
```
