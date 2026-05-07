import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      clientCompanyId,
      avatarProfileId,
      title,
      workType,
      inputText,
      reviewPurpose,
    } = await req.json();

    // プラン制限確認
    const limitCheck = await base44.asServiceRole.functions.invoke("checkExecutiveAvatarUsageLimit", {
      clientCompanyId,
      usageType: "avatar_work_review",
      requestedUnits: 1,
      unitName: "review",
    });

    if (!limitCheck.allowed) {
      return Response.json({
        error: "Usage limit exceeded",
        message: limitCheck.message,
      }, { status: 429 });
    }

    // プロファイル確認
    const profile = await base44.asServiceRole.entities.ExecutiveAvatarProfile.get(avatarProfileId);
    if (!profile || profile.consentStatus !== "approved" || profile.status !== "active") {
      return Response.json({
        error: "Avatar not ready",
        message: "ExecutiveAvatarがアクティブになっていません。",
      }, { status: 400 });
    }

    // 会社・ポリシー・ナレッジ取得
    const company = await base44.asServiceRole.entities.ClientCompany.get(clientCompanyId);
    const policies = await base44.asServiceRole.entities.AnswerPolicy.filter({
      clientCompanyId,
      status: "active",
    });
    const policy = policies[0] || null;

    const chunks = await base44.asServiceRole.entities.KnowledgeChunk.filter({
      clientCompanyId,
      status: "approved",
    });

    // Gemini でレビュー生成
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const geminiModel = Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash";

    if (!geminiKey) {
      return Response.json({
        error: "Gemini API key not configured",
        message: "GEMINI_API_KEY が設定されていません。",
      }, { status: 500 });
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
      return Response.json({
        error: "Gemini API error",
        message: "レビュー生成に失敗しました。",
      }, { status: 500 });
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
    return Response.json({ error: error.message }, { status: 500 });
  }
});