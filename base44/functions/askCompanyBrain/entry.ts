import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

function json(data, status = 200) {
  return Response.json(data, { status });
}

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

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[、。！？,.!?;:：；（）()[\]{}"'「」『』]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getAllowedScopes(role, channel) {
  if (channel === "admin_test") {
    if (role !== "softdoing_admin") {
      throw new Error("admin_test は SOFTDOING管理者のみ利用できます。");
    }
    return ["public", "internal", "executive", "admin_only"];
  }

  if (channel === "executive") {
    if (!["softdoing_admin", "client_admin", "executive"].includes(role)) {
      throw new Error("経営者向けAIを利用する権限がありません。");
    }
    return ["public", "internal", "executive"];
  }

  if (channel === "internal") {
    if (!["softdoing_admin", "client_admin", "editor", "employee", "executive"].includes(role)) {
      throw new Error("社内向けAIを利用する権限がありません。");
    }
    return ["public", "internal"];
  }

  return ["public"];
}

function scoreChunk(question, chunk) {
  const q = normalizeText(question);

  const text = normalizeText([
    chunk.title,
    chunk.chunkText,
    chunk.category,
    Array.isArray(chunk.tags) ? chunk.tags.join(" ") : "",
    Array.isArray(chunk.keywords) ? chunk.keywords.join(" ") : "",
  ].join(" "));

  if (!q || !text) return 0;

  let score = 0;

  if (text.includes(q)) score += 10;

  const terms = q.split(" ").filter((t) => t.length >= 2);
  for (const term of terms) {
    if (text.includes(term)) score += 3;
  }

  const compact = q.replace(/\s+/g, "");
  for (let i = 0; i < compact.length - 1; i++) {
    const bigram = compact.slice(i, i + 2);
    if (text.includes(bigram)) score += 0.3;
  }

  if (chunk.category && q.includes(normalizeText(chunk.category))) score += 2;

  return score;
}

function clampConfidence(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) {
      return jsonError("unauthorized", "認証が必要です。ログインしてください。", 401);
    }

    const body = await req.json();

    const clientCompanyId = String(body.clientCompanyId || "");
    const question = String(body.question || "");
    const channel = String(body.channel || "internal");
    const category = String(body.category || "");

    if (!clientCompanyId) {
      return jsonError("invalid_request", "clientCompanyId is required", 400);
    }
    if (!question.trim()) {
      return jsonError("invalid_request", "question is required", 400);
    }
    if (!["public", "internal", "executive", "admin_test"].includes(channel)) {
      return jsonError("invalid_request", "Invalid channel", 400);
    }

    // テナント分離: asServiceRole を使う前に必ずチェック
    const tenant = assertTenantAccess(user, clientCompanyId);
    if (!tenant.allowed) {
      return jsonError(tenant.errorType, tenant.message, 403);
    }

    const role = resolveBusinessRole(user);

    // channelごとの参照可能スコープ取得（ロール検証含む）
    let allowedScopes;
    try {
      allowedScopes = getAllowedScopes(role, channel);
    } catch (error) {
      return jsonError("forbidden_channel", error.message, 403);
    }

    // 二重ガード: admin_only は softdoing_admin 以外には絶対に渡さない
    if (!isGlobalAdmin(user)) {
      allowedScopes = allowedScopes.filter((s) => s !== "admin_only");
    }

    const PLAN_LIMITS = {
      Light: { aiAnswerLimitMonthly: 1000, videoSecondsLimitMonthly: 0 },
      Standard: { aiAnswerLimitMonthly: 5000, videoSecondsLimitMonthly: 600 },
      Professional: { aiAnswerLimitMonthly: 20000, videoSecondsLimitMonthly: 1800 },
      Enterprise: { aiAnswerLimitMonthly: null, videoSecondsLimitMonthly: null },
    };

    const companyData = await base44.asServiceRole.entities.ClientCompany.get(clientCompanyId);
    if (!companyData) {
      return jsonError("company_not_found", "ClientCompany not found", 404);
    }

    const planName = companyData.planName || "Light";
    const limits = PLAN_LIMITS[planName] || PLAN_LIMITS.Light;
    const currentMonth = new Date().toISOString().slice(0, 7);

    // 当月のAI回答数をカウント
    const monthlyConversations = await base44.asServiceRole.entities.ConversationLog.filter({
      clientCompanyId,
    }).then(c => c.filter(x => x.created_date?.startsWith(currentMonth)));

    if (limits.aiAnswerLimitMonthly !== null && monthlyConversations.length >= limits.aiAnswerLimitMonthly) {
      return jsonError(
        "usage_limit_exceeded",
        `月間AI回答数の上限（${limits.aiAnswerLimitMonthly}回答）に達しています。`,
        429,
        { planName, used: monthlyConversations.length, limit: limits.aiAnswerLimitMonthly }
      );
    }

    // 承認済みナレッジを取得・フィルタリング
    const rawChunks = await base44.asServiceRole.entities.KnowledgeChunk.filter({
      clientCompanyId,
      status: "approved",
    });

    const permittedChunks = rawChunks.filter((chunk) => {
      const scopeOk = allowedScopes.includes(chunk.audienceScope);
      const categoryOk = category ? chunk.category === category : true;
      return scopeOk && categoryOk;
    });

    // スコアリングでトップ12件を選択
    const topChunks = permittedChunks
      .map((chunk) => ({ ...chunk, _score: scoreChunk(question, chunk) }))
      .sort((a, b) => b._score - a._score)
      .slice(0, 12);

    const policyScope = channel === "admin_test" ? "internal" : channel;
    const policies = await base44.asServiceRole.entities.AnswerPolicy.filter({
      clientCompanyId,
      audienceScope: policyScope,
      status: "active",
    });
    const policy = policies?.[0] || null;

    const sourcesText = topChunks
      .map((chunk, index) =>
        [
          `【Source ${index + 1}】`,
          `タイトル: ${chunk.title || ""}`,
          `カテゴリ: ${chunk.category || ""}`,
          `公開範囲: ${chunk.audienceScope || ""}`,
          `内容:`,
          `${chunk.chunkText || ""}`,
        ].join("\n")
      )
      .join("\n\n");

    const channelLabel =
      channel === "public" ? "社外向け" :
      channel === "internal" ? "社内向け" :
      channel === "executive" ? "経営者向け" :
      "管理者テスト";

    const systemPrompt = `
あなたは「CompanyBrain AI」です。
企業の知識・理念・判断基準を、会社らしい言葉で説明するAIです。

【会社情報】
会社名:
${companyData.companyName || ""}

会社概要:
${companyData.companyOverview || ""}

ミッション:
${companyData.mission || ""}

ビジョン:
${companyData.vision || ""}

価値観:
${companyData.values || ""}

ブランドトーン:
${companyData.brandTone || "丁寧、誠実、専門的、わかりやすい"}

主なサービス:
${companyData.mainServices || ""}

対象チャネル:
${channelLabel}

【基本ルール】
- 必ず参照情報に基づいて回答してください。
- 参照情報にないことは断定しないでください。
- 不明な場合は「確認が必要です」と伝えてください。
- 社外向けでは、社内情報、経営判断、価格交渉方針、未公開情報を絶対に出さないでください。
- 社内向けでは、実務で使いやすいように具体的に答えてください。
- 経営者向けでは、判断材料、リスク、選択肢、推奨アクションを整理してください。
- 法務、税務、労務、医療など専門判断が必要な内容は、専門家確認を促してください。
- 回答は自然な日本語にしてください。
- 会社らしい、丁寧で信頼感のある口調にしてください。

【追加ポリシー】
${policy?.systemPrompt || ""}

【話し方ガイド】
${policy?.toneGuide || ""}

【禁止トピック】
${policy?.forbiddenTopics || ""}

【エスカレーション条件】
${policy?.escalationRules || ""}

【免責文】
${policy?.disclaimerText || ""}
`.trim();

    const userPrompt = `
ユーザー質問:
${question}

参照情報:
${sourcesText || "該当する承認済みナレッジは見つかりませんでした。"}

次のJSON形式だけで回答してください。
- answer: 実際の回答文
- confidence: 0〜1の数値
- needHumanReview: 人間確認が必要なら true
- reason: 判断理由
- usedSourceIndexes: 使ったSource番号の配列。Source 1なら1。
`.trim();

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash";

    if (!geminiApiKey) {
      return jsonError("missing_gemini_key", "GEMINI_API_KEY is not set", 500);
    }

    // Gemini API を呼び出す
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: systemPrompt + "\n\n" + userPrompt }] },
          ],
          generationConfig: {
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const detail = await geminiRes.text();
      console.error("[askCompanyBrain] Gemini API error", geminiRes.status, detail);
      return jsonError("gemini_api_error", "Gemini APIの呼び出しに失敗しました。", 502, { status: geminiRes.status, detail });
    }

    const geminiData = await geminiRes.json();
    const outputText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

    let parsed;
    try {
      parsed = JSON.parse(outputText);
    } catch (_error) {
      parsed = {
        answer: outputText || "回答生成結果の解析に失敗しました。担当者による確認が必要です。",
        confidence: 0.3,
        needHumanReview: true,
        reason: "Gemini response JSON parse failed",
        usedSourceIndexes: [],
      };
    }

    const confidence = clampConfidence(parsed.confidence);

    const usedSources = Array.isArray(parsed.usedSourceIndexes)
      ? parsed.usedSourceIndexes
          .map((sourceIndex) => {
            const chunk = topChunks[sourceIndex - 1];
            if (!chunk) return null;
            return {
              sourceIndex,
              title: chunk.title || "",
              knowledgeSourceId: chunk.knowledgeSourceId || "",
              chunkId: chunk.id || "",
              audienceScope: chunk.audienceScope || "",
              category: chunk.category || "",
            };
          })
          .filter(Boolean)
      : [];

    const noSourceUsed = usedSources.length === 0;
    const lowConfidence = confidence < 0.6;
    const needHumanReview = Boolean(parsed.needHumanReview) || noSourceUsed || lowConfidence;

    // ConversationLogに保存
    const log = await base44.asServiceRole.entities.ConversationLog.create({
      clientCompanyId,
      userId: user.id,
      channel,
      question,
      answer: parsed.answer,
      usedSources,
      confidence,
      needHumanReview,
      feedback: "none",
      feedbackComment: "",
    });

    // UsageRecordに記録
    await base44.asServiceRole.entities.UsageRecord.create({
      clientCompanyId,
      usageType: "ai_answer",
      provider: "gemini",
      units: 1,
      unitName: "answer",
      estimatedCostUsd: 0,
      metadata: JSON.stringify({
        channel,
        question: question.slice(0, 200),
        conversationLogId: log.id,
      }),
    });

    return json({
      answer: parsed.answer,
      confidence,
      needHumanReview,
      reason: parsed.reason,
      usedSources,
      conversationLogId: log.id,
    });

  } catch (error) {
    console.error("[askCompanyBrain] Unexpected error:", error?.message, error?.stack);
    return jsonError("unexpected_error", error?.message || "Unexpected error", 500, { stack: error?.stack || null });
  }
});
