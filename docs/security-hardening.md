# CompanyBrain AI セキュリティ強化対応記録

| 項目 | 内容 |
|---|---|
| 実施日 | 2026-05-07 |
| 対象 | `base44/functions/` 配下の 8 Function |
| 由来 | `docs/architecture-audit.md` の P0 指摘 |
| ビルド | `npm run build` 通過確認済 |

## 1. 共通方針

Base44 の Backend Function は各 `entry.ts` が独立した Deno スクリプトのため、**共通モジュールを `import` できない**。そのため、共通ヘルパーを **各 Function に同一実装でインライン展開**する方針を採用。インライン関数のシグネチャは 8 ファイル間で完全一致させ、将来 Deno deploy 上で `import map` を使えるようになった時にそのまま外出しできる粒度で書いている。

### 共通ヘルパー（各 Function 冒頭にインライン定義）

```ts
// 構造化エラーレスポンス
function jsonError(errorType, message, status = 500, detail) {
  const body = { errorType, message, error: message };
  if (detail !== undefined) body.detail = detail;
  return Response.json(body, { status });
}

// businessRole の正規化（businessRole 優先、未設定で role==='admin' なら softdoing_admin、なければ viewer）
function resolveBusinessRole(user) {
  const businessRole = String(user?.businessRole || "").trim();
  if (businessRole) return businessRole;
  const base44Role = String(user?.role || "").toLowerCase().trim();
  if (base44Role === "admin") return "softdoing_admin";
  return "viewer";
}

// グローバル管理者判定
function isGlobalAdmin(user) {
  const role = resolveBusinessRole(user);
  return role === "softdoing_admin" || String(user?.role || "").toLowerCase() === "admin";
}

// テナント分離: グローバル管理者は通過、それ以外は user.clientCompanyId === clientCompanyId を要求
function assertTenantAccess(user, clientCompanyId) {
  if (isGlobalAdmin(user)) return { allowed: true };
  const userCompanyId = String(user?.clientCompanyId || "");
  if (!userCompanyId) {
    return { allowed: false, errorType: "missing_user_company", message: "User clientCompanyId is missing" };
  }
  if (userCompanyId !== String(clientCompanyId || "")) {
    return { allowed: false, errorType: "tenant_mismatch", message: "You cannot access another company's data." };
  }
  return { allowed: true };
}

// audienceScope 別の参照可能ナレッジスコープ（admin_only は softdoing_admin のみ）
function knowledgeScopesForAudience(audienceScope, isAdmin) {
  const base = {
    public_demo: ["public"],
    internal: ["public", "internal"],
    training: ["public", "internal"],
    executive: ["public", "internal", "executive"],
  };
  const scopes = [...(base[audienceScope] || ["public"])];
  if (isAdmin) scopes.push("admin_only");
  return scopes;
}
```

## 2. 各 Function の対応内容

凡例: ✅=新規追加 / ♻=既存だが構造化に書き直し / 🛡=既存ガードを保持

### `askCompanyBrain`

| 観点 | 対応 |
|---|---|
| auth.me | 🛡 既存 |
| 401 未ログイン | ♻ `jsonError("unauthorized", ..., 401)` に変更 |
| businessRole 正規化 | 🛡 `resolveBusinessRole` を共通シグネチャに揃え |
| テナント分離 | ✅ **`asServiceRole` 呼び出し前に `assertTenantAccess` を実行**（従来は ClientCompany.get / UsageRecord.create の後で 403 返していた順序逆転を解消） |
| consentStatus | — (アバター非関与) |
| status=active | — |
| スコープフィルタ | 🛡 `getAllowedScopes` 既存。さらに **二重ガード**として `!isGlobalAdmin(user) ? scopes.filter(s => s !== "admin_only") : scopes` を追加し、`channel='admin_test'` 以外でも admin_only が漏れないよう保険を追加 |
| 構造化エラー | ♻ 全ての error return を `jsonError(errorType, message, status, detail?)` に統一 |
| その他 | モデル名 `gemini-2.0-flash` ハードコードを `Deno.env.get("GEMINI_MODEL") \|\| "gemini-2.0-flash"` に変更（他 Function と統一） |

### `reviewWorkWithExecutiveBrain`

| 観点 | 対応 |
|---|---|
| auth.me / 401 | 🛡♻ |
| businessRole 正規化 | ✅ 新規追加 |
| テナント分離 | ✅ 入力 `clientCompanyId` と user の照合 + `profile.clientCompanyId` の照合（avatarProfileId 経由のクロステナント防止） |
| consentStatus=approved | 🛡 既存（個別 errorType に分離） |
| status=active | 🛡 既存（個別 errorType に分離） |
| スコープフィルタ | ✅ **新規追加**: `knowledgeScopesForAudience(profile.audienceScope, isGlobalAdmin(user))` で KnowledgeChunk を filter（従来は scope 未指定で全件流入＝admin_only も Gemini プロンプトに混入していた） |
| 構造化エラー | ♻ |

### `startExecutiveAvatarSession`

| 観点 | 対応 |
|---|---|
| auth.me / 401 | 🛡♻ |
| businessRole 正規化 | ✅ 新規追加 |
| テナント分離 | ✅ 入力 `clientCompanyId` と user の照合 + `profile.clientCompanyId` の照合 |
| consentStatus=approved | 🛡 既存（errorType を `consent_not_approved` に統一） |
| status=active | 🛡 既存（errorType を `avatar_not_active` に統一） |
| スコープフィルタ | — (このセッション開始 Function ではナレッジ参照なし) |
| 構造化エラー | ♻ 全エラーパスに `errorType` を付与（`unauthorized`, `tenant_mismatch`, `usage_limit_exceeded`, `avatar_not_found`, `consent_not_approved`, `avatar_not_active`, `missing_avatar_ids`, `missing_gemini_key`, `unexpected_error`） |

### `syncExecutiveAvatarContext`

| 観点 | 対応 |
|---|---|
| auth.me / 401 | 🛡♻ |
| businessRole 正規化 | ✅ 新規追加 |
| テナント分離 | ✅ 入力 `clientCompanyId` と user の照合 + `profile.clientCompanyId` の照合 |
| consentStatus=approved | 🛡 既存。ただし **status=active は意図的に追加しない**（このフローはアバター活性化前にも呼ぶ必要があるため） |
| スコープフィルタ | ♻ 既存の `allowedScopes` map を共通ヘルパー `knowledgeScopesForAudience` に置き換え。**admin_only は softdoing_admin のみに限定**（従来は audienceScope=executive でも admin_only が含まれていなかったが、明示的に分岐で保証） |
| 構造化エラー | ♻ |
| その他 | dead code だった `Deno.env.get("HEYGEN_API_KEY")` を削除 |

### `createExecutiveAvatarFromSourceVideo`

| 観点 | 対応 |
|---|---|
| auth.me / 401 | 🛡♻ |
| businessRole 正規化 | ✅ 新規追加 |
| テナント分離 | ✅ 入力 `clientCompanyId` と user の照合 + `profile.clientCompanyId` の照合 |
| consentStatus=approved | 🛡 既存 |
| status=active | — (この Function は avatar 作成段階なので status=active は要求しない) |
| スコープフィルタ | — (ナレッジ参照なし) |
| 構造化エラー | ♻ |

### `createRecordedExecutiveAvatarVideo`

| 観点 | 対応 |
|---|---|
| auth.me / 401 | 🛡♻ |
| businessRole 正規化 | ✅ 新規追加 |
| テナント分離 | ✅ 入力 `clientCompanyId` と user の照合 + `profile.clientCompanyId` の照合 |
| **consentStatus=approved** | ✅ **🔴 P0 指摘対応**: 従来は `status==="active"` のみ確認していたため、consent 未承認でも status=active なら録画動画生成が走る抜け道があった。`consentStatus !== "approved"` の場合は 403 で停止 |
| status=active | 🛡 既存 |
| Lightプラン拒否 | ♻ 既存ロジック保持 + 構造化エラー化 |
| スコープフィルタ | — (ナレッジ参照なし) |
| 構造化エラー | ♻ |

### `createHeygenLipsync`

| 観点 | 対応 |
|---|---|
| auth.me / 401 | 🛡♻ |
| businessRole 正規化 | ✅ 新規追加 |
| テナント分離 | ✅ **VideoProject 取得 → `project.clientCompanyId` と user の照合** という順序で実装。入力には `videoProjectId` しか無いため、まず `asServiceRole` で project を取得してからテナント検証する（fetch 順は不可避だが、その後の HeyGen 呼出・課金記録は確実にブロックされる） |
| consentStatus / status | — (この Function は ExecutiveAvatarProfile を直接使わない) |
| スコープフィルタ | — |
| 構造化エラー | ♻ |

### `generateVideoScript`

| 観点 | 対応 |
|---|---|
| auth.me / 401 | 🛡♻ |
| businessRole 正規化 | ✅ 新規追加 |
| テナント分離 | ✅ 入力 `clientCompanyId` と user の照合 |
| consentStatus / status | — (アバター非関与) |
| スコープフィルタ | 🛡 既存で `audienceScope: "public"` のみを参照。台本は社外向けなので問題なし |
| 構造化エラー | ♻ |
| その他 | UsageRecord の provider を `"gemini"` から **`"openai"`** に修正（実態は OpenAI を呼んでいるため） |

## 3. エラーレスポンス仕様

統一フォーマット:

```json
{
  "errorType": "tenant_mismatch",
  "message": "You cannot access another company's data.",
  "error": "You cannot access another company's data.",
  "detail": { "...任意": "..." }
}
```

- `errorType`: machine readable な短い識別子
- `message`: 人間向けメッセージ
- `error`: 旧フロントとの後方互換のため `message` と同じ値を残す
- `detail`: 任意。プラン名・上限・HeyGen/OpenAI のレスポンス本文など

代表的な errorType:

| errorType | HTTP | 意味 |
|---|---|---|
| `unauthorized` | 401 | 未ログイン |
| `invalid_request` | 400 | 必須パラメータ欠落・形式不正 |
| `tenant_mismatch` | 403 | 別テナントへのアクセス試行 |
| `missing_user_company` | 403 | user.clientCompanyId 未設定 |
| `forbidden_channel` | 403 | role が channel 利用ロールに含まれない |
| `consent_not_approved` | 403 | アバター本人同意未承認 |
| `avatar_not_active` | 400 | アバター status !== "active" |
| `avatar_not_found` | 404 | ExecutiveAvatarProfile 未取得 |
| `company_not_found` | 404 | ClientCompany 未取得 |
| `video_project_not_found` | 404 | VideoProject 未取得 |
| `missing_avatar_ids` | 400 | provider IDs 未登録 |
| `missing_media` | 400 | videoFileUri / audioFileUri 欠落 |
| `usage_limit_exceeded` | 429 | プラン上限超過 |
| `plan_not_allowed` | 403 | プラン階層的に未提供機能 |
| `missing_gemini_key` / `missing_heygen_key` / `missing_openai_key` | 500 | 環境変数未設定 |
| `gemini_api_error` / `heygen_api_error` / `openai_api_error` | 502 | 外部 API 失敗 |
| `invalid_creation_mode` | 400 | creationMode 値不正 |
| `unexpected_error` | 500 | 想定外例外 |

## 4. テナント分離の実装パターン

`asServiceRole` を使う前に必ず：

**パターン A**（入力に `clientCompanyId` があるケース — 7 Function）

```ts
const { clientCompanyId, ... } = await req.json();
if (!clientCompanyId) return jsonError("invalid_request", "...", 400);

const tenant = assertTenantAccess(user, clientCompanyId);
if (!tenant.allowed) return jsonError(tenant.errorType, tenant.message, 403);

// ここから asServiceRole を使ってよい
```

**パターン B**（入力が `videoProjectId` などのリソース ID で `clientCompanyId` を含まないケース — `createHeygenLipsync`）

```ts
const project = await base44.asServiceRole.entities.VideoProject.get(videoProjectId);
if (!project) return jsonError("video_project_not_found", "...", 404);

const tenant = assertTenantAccess(user, project.clientCompanyId);
if (!tenant.allowed) return jsonError(tenant.errorType, tenant.message, 403);

// 以後 HeyGen 呼出・課金記録などはここまで通過後にのみ実行
```

**パターン C**（avatarProfileId のクロステナント検査 — 4 Avatar Function）

```ts
const profile = await base44.asServiceRole.entities.ExecutiveAvatarProfile.get(avatarProfileId);
if (!profile) return jsonError("avatar_not_found", "...", 404);

if (!isGlobalAdmin(user) && String(profile.clientCompanyId) !== String(clientCompanyId)) {
  return jsonError("tenant_mismatch", "このアバターは別の会社に属しています。", 403);
}
```

入力の `clientCompanyId` と avatar の `clientCompanyId` を**両方**user と照合することで、攻撃者が `clientCompanyId=自社, avatarProfileId=他社` を渡すパターンも遮断する。

## 5. 残課題（このタスク範囲外）

`docs/architecture-audit.md` の P0/P1 のうち、本タスクで対応していない項目:

- フロントエンド側の `ProtectedRoute` 全画面適用、Sidebar のロール出し分け
- `AdminUserSettings` での自己ロール昇格防止
- `AvatarConsentRegistration` の `asServiceRole` 直叩きを Backend Function 化
- `ChatInterface.jsx`（dead code）削除
- CLIENT_ID ハードコードを `useAuth().user.clientCompanyId` に置換
- 以下 Function の同種強化（次回対応）:
  - `aiChat`（プラン制限欠如）
  - `generateSpeech`（テナント分離・プラン制限欠如）
  - `evaluateAvatarTrainingSession`（テナント分離・スコープフィルタ欠如）
  - `fetchExecutiveAvatarTranscript`（テナント分離欠如）
  - `stopExecutiveAvatarSession`（テナント分離欠如）
  - `registerAvatarProviderIds`（テナント分離欠如）
  - `checkHeygenLipsync`（テナント分離欠如）
  - `checkPlanLimits` / `checkUsageLimit` / `checkExecutiveAvatarUsageLimit` / `debugExecutiveBrainIntegration`（情報漏洩リスク）
- プラン上限値の共通モジュール化（6 ファイル重複）
