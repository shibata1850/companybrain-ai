import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

function jsonError(errorType, message, status = 500, detail) {
  const body = { errorType, message, error: message };
  if (detail !== undefined) body.detail = detail;
  return Response.json(body, { status });
}

function resolveBusinessRole(user) {
  const businessRole = String(user?.businessRole || "").trim();
  if (businessRole) return businessRole;
  const base44Role = String(user?.role || "").toLowerCase().trim();
  if (base44Role === "admin") return "softdoing_admin";
  return "viewer";
}

function isGlobalAdmin(user) {
  const role = resolveBusinessRole(user);
  return role === "softdoing_admin" || String(user?.role || "").toLowerCase() === "admin";
}

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return jsonError("unauthorized", "認証が必要です。ログインしてください。", 401);
    }

    const {
      clientCompanyId,
      avatarProfileId,
      title,
      workType,
      inputText,
      reviewPurpose,
    } = await req.json();

    if (!clientCompanyId) return jsonError("invalid_request", "clientCompanyId is required", 400);
    if (!avatarProfileId) return jsonError("invalid_request", "avatarProfileId is required", 400);

    // テナント分離: asServiceRole を使う前に必ずチェック
    const tenant = assertTenantAccess(user, clientCompanyId);
    if (!tenant.allowed) {
      return jsonError(tenant.errorType, tenant.message, 403);
    }

    // プラン制限確認
    const limitCheck = await base44.asServiceRole.functions.invoke("checkExecutiveAvatarUsageLimit", {
      clientCompanyId,
      usageType: "avatar_work_review",
      requestedUnits: 1,
      unitName: "review",
    });

    if (!limitCheck.allowed) {
      return jsonError("usage_limit_exceeded", limitCheck.message || "利用上限を超過しました。", 429, limitCheck);
    }

    // プロファイル取得
    const profile = await base44.asServiceRole.entities.ExecutiveAvatarProfile.get(avatarProfileId);
    if (!profile) {
      return jsonError("avatar_not_found", "ExecutiveAvatarProfile が見つかりません。", 404);
    }

    // アバターのテナント整合確認（avatarProfileId 経由のクロステナント防止）
    if (!isGlobalAdmin(user) && String(profile.clientCompanyId || "") !== String(clientCompanyId)) {
      return jsonError("tenant_mismatch", "このアバターは別の会社に属しています。", 403);
    }

    // 同意・有効化チェック
    if (profile.consentStatus !== "approved") {
      return jsonError("consent_not_approved", "本人同意（consentStatus = approved）が承認されていません。", 403);
    }
    if (profile.status !== "active") {
      return jsonError("avatar_not_active", "ExecutiveAvatarがアクティブになっていません。", 400);
    }

    // 会社・ポリシー・ナレッジ取得
    const company = await base44.asServiceRole.entities.ClientCompany.get(clientCompanyId);
    if (!company) {
      return jsonError("company_not_found", "ClientCompany が見つかりません。", 404);
    }

    const policies = await base44.asServiceRole.entities.AnswerPolicy.filter({
      clientCompanyId,
      status: "active",
    });
    const policy = policies[0] || null;

    // KnowledgeChunk をスコープで filter（admin_only は softdoing_admin のみ）
    const allowedScopes = knowledgeScopesForAudience(profile.audienceScope, isGlobalAdmin(user));
    const allChunks = await base44.asServiceRole.entities.KnowledgeChunk.filter({
      clientCompanyId,
      status: "approved",
    });
    const chunks = allChunks.filter((c) => allowedScopes.includes(c.audienceScope));

    // Gemini でレビュー生成
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const geminiModel = Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash";

    if (!geminiKey) {
      return jsonError("missing_gemini_key", "GEMINI_API_KEY が設定されていません。", 500);
    }

    const reviewPrompt = `
あなたは企業の上級管理職です。以下のテキストを、会社方針と判断基準に沿ってレビューしてください。

【企業情報】
会社名: ${company?.companyName}
理念: ${company?.mission}
価値観: ${company?.values}

【会社方針】
${policy?.systemPrompt || ""}

【話し方ガイド】
${policy?.toneGuide || ""}

【禁止事項】
${policy?.forbiddenTopics || ""}

【参照ナレッジ（会社の方針・基準）】
${chunks.slice(0, 10).map(c => `- ${c.title}: ${c.chunkText}`).join("\n")}

【レビュー対象】
タイプ: ${workType}
タイトル: ${title}
目的: ${reviewPurpose}

【対象テキスト】
${inputText}

上記に基づいて、以下のJSON形式でレビューを生成してください：
{
  "overallReview": "全体的なレビュー・評価",
  "companyPolicyFit": 数値(0-100),
  "riskPoints": ["リスク点1", "リスク点2", ...],
  "improvementAdvice": "改善アドバイス",
  "revisedDraft": "修正案（あれば）",
  "decisionCriteriaUsed": ["適用した判断基準1", "適用した判断基準2", ...],
  "needHumanReview": boolean,
  "referencedSources": ["参照したナレッジ1", "参照したナレッジ2", ...]
}
`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: reviewPrompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties: {
                overallReview: { type: "string" },
                companyPolicyFit: { type: "number" },
                riskPoints: { type: "array", items: { type: "string" } },
                improvementAdvice: { type: "string" },
                revisedDraft: { type: "string" },
                decisionCriteriaUsed: { type: "array", items: { type: "string" } },
                needHumanReview: { type: "boolean" },
                referencedSources: { type: "array", items: { type: "string" } },
              },
            },
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const detail = await geminiRes.text();
      return jsonError("gemini_api_error", "レビュー生成に失敗しました。", 502, { status: geminiRes.status, detail });
    }

    const geminiData = await geminiRes.json();
    const review = JSON.parse(
      geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}"
    );

    // WorkReviewRequest 作成
    const workReview = await base44.asServiceRole.entities.WorkReviewRequest.create({
      clientCompanyId,
      avatarProfileId,
      userId: user.id,
      title,
      workType,
      inputText,
      reviewPurpose,
      overallReview: review.overallReview,
      companyPolicyFit: review.companyPolicyFit,
      riskPoints: review.riskPoints || [],
      improvementAdvice: review.improvementAdvice,
      revisedDraft: review.revisedDraft,
      decisionCriteriaUsed: review.decisionCriteriaUsed || [],
      needHumanReview: review.needHumanReview || false,
      referencedSources: review.referencedSources || [],
      status: review.needHumanReview ? "pending_human_review" : "completed",
    });

    // UsageRecord に記録
    await base44.asServiceRole.entities.UsageRecord.create({
      clientCompanyId,
      usageType: "avatar_work_review",
      provider: "gemini",
      units: 1,
      unitName: "review",
      estimatedCostUsd: 0,
      metadata: JSON.stringify({
        workReviewId: workReview.id,
        workType,
        avatarProfileId,
      }),
    });

    return Response.json({
      success: true,
      review,
      workReview,
      message: review.needHumanReview
        ? "レビューが完成し、人間による確認待機中です。"
        : "レビューが完成しました。",
    });
  } catch (error) {
    console.error("[reviewWorkWithExecutiveBrain] Unexpected error:", error?.message, error?.stack);
    return jsonError("unexpected_error", error?.message || "Unexpected error", 500, { stack: error?.stack || null });
  }
});
