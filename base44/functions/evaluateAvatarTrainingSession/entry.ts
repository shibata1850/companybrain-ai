import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { avatarConversationSessionId } = await req.json();

    // セッション取得
    const session = await base44.asServiceRole.entities.AvatarConversationSession.get(
      avatarConversationSessionId
    );

    if (!session) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }

    // トランスクリプト確認
    if (!session.transcript) {
      return Response.json({
        error: "No transcript",
        message: "文字起こしがありません。fetchExecutiveAvatarTranscript で取得してください。",
      }, { status: 400 });
    }

    // シナリオ・会社・ナレッジ取得
    const scenario = session.scenario
      ? await base44.asServiceRole.entities.AvatarTrainingScenario.get(session.scenario)
      : null;

    const company = await base44.asServiceRole.entities.ClientCompany.get(session.clientCompanyId);
    const chunks = await base44.asServiceRole.entities.KnowledgeChunk.filter({
      clientCompanyId: session.clientCompanyId,
      status: "approved",
    });

    // Gemini で評価を生成
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const geminiModel = Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash";

    if (!geminiKey) {
      return Response.json({
        error: "Gemini API key not configured",
        message: "GEMINI_API_KEY が設定されていません。",
      }, { status: 500 });
    }

    const evaluationPrompt = `
以下の研修シナリオでの学習者のパフォーマンスを評価してください。

【シナリオ】
${scenario?.title || "ExecutiveBrain Avatar Training"}
${scenario?.description || ""}

【学習目標】
${scenario?.learningObjectives?.join("\n") || "実務スキルの向上"}

【評価基準】
${scenario?.evaluationCriteria || "会社方針への理解度、判断の正確性、コミュニケーション能力"}

【会社情報】
企業名: ${company?.companyName}
理念: ${company?.mission}
価値観: ${company?.values}

【参照ナレッジ】
${chunks.slice(0, 10).map(c => `- ${c.title}: ${c.chunkText}`).join("\n")}

【学習者の回答】
${session.transcript}

上記に基づいて、以下のJSON形式で詳細な評価を生成してください：
{
  "summary": "セッションの要約（1-2文）",
  "evaluationScore": 数値(0-100),
  "goodPoints": ["良かった点1", "良かった点2", ...],
  "improvementPoints": ["改善すべき点1", "改善すべき点2", ...],
  "companyPolicyUnderstanding": 数値(0-100),
  "decisionCriteriaUnderstanding": 数値(0-100),
  "nextLearningItems": ["次に学ぶべき項目1", "次に学ぶべき項目2", ...],
  "needHumanReview": boolean,
  "actionItems": ["アクションアイテム1", "アクションアイテム2", ...]
}
`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: evaluationPrompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties: {
                summary: { type: "string" },
                evaluationScore: { type: "number" },
                goodPoints: { type: "array", items: { type: "string" } },
                improvementPoints: { type: "array", items: { type: "string" } },
                companyPolicyUnderstanding: { type: "number" },
                decisionCriteriaUnderstanding: { type: "number" },
                nextLearningItems: { type: "array", items: { type: "string" } },
                needHumanReview: { type: "boolean" },
                actionItems: { type: "array", items: { type: "string" } },
              },
            },
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      return Response.json({
        error: "Gemini API error",
        message: "評価生成に失敗しました。",
      }, { status: 500 });
    }

    const geminiData = await geminiRes.json();
    const evaluation = JSON.parse(
      geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}"
    );

    // セッション更新
    const updateData = {
      summary: evaluation.summary,
      evaluationScore: evaluation.evaluationScore,
      advice: evaluation.improvementPoints?.join("\n") || "",
      actionItems: evaluation.actionItems || [],
      needHumanReview: evaluation.needHumanReview || false,
    };

    const updated = await base44.asServiceRole.entities.AvatarConversationSession.update(
      avatarConversationSessionId,
      updateData
    );

    return Response.json({
      success: true,
      evaluation,
      session: updated,
      message: "評価が生成されました。",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});