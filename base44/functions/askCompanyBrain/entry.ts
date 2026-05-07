import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

function json(data, status = 200) {
  return Response.json(data, { status });
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

function extractOutputText(openaiData) {
  if (typeof openaiData.output_text === "string") {
    return openaiData.output_text;
  }

  const texts = [];

  for (const item of openaiData.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") {
        texts.push(content.text);
      }
      if (typeof content.output_text === "string") {
        texts.push(content.output_text);
      }
      if (content.type === "refusal" && content.refusal) {
        return JSON.stringify({
          answer: "この質問には安全上の理由により回答できません。担当者による確認が必要です。",
          confidence: 0,
          needHumanReview: true,
          reason: content.refusal,
          usedSourceIndexes: [],
        });
      }
    }
  }

  return texts.join("\n").trim();
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
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json();

    const clientCompanyId = String(body.clientCompanyId || "");
    const question = String(body.question || "");
    const channel = String(body.channel || "internal");
    const category = String(body.category || "");

    if (!clientCompanyId) {
      return json({ error: "clientCompanyId is required" }, 400);
    }
    if (!question.trim()) {
      return json({ error: "question is required" }, 400);
    }
    if (!["public", "internal", "executive", "admin_test"].includes(channel)) {
      return json({ error: "Invalid channel" }, 400);
    }

    const role = String(user.businessRole || user.role || "viewer");
    const userCompanyId = String(user.clientCompanyId || "");

    // テナント分離：softdoing_admin または Base44 admin以外は自社データのみ
    const isGlobalAdmin = role === "softdoing_admin" || user.role === "admin";
    if (!isGlobalAdmin) {
      if (!userCompanyId) {
        return json({ error: "User clientCompanyId is missing" }, 403);
      }
      if (userCompanyId !== clientCompanyId) {
        return json({ error: "You cannot access another company's data." }, 403);
      }
    }

    // channelごとの参照可能スコープ取得
    let allowedScopes;
    try {
      allowedScopes = getAllowedScopes(role, channel);
    } catch (error) {
      return json({ error: error.message }, 403);
    }

    // 会社情報取得
    const company = await base44.asServiceRole.entities.ClientCompany.get(clientCompanyId);
    if (!company) {
      return json({ error: "ClientCompany not found" }, 404);
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
${company.companyName || ""}

会社概要:
${company.companyOverview || ""}

ミッション:
${company.mission || ""}

ビジョン:
${company.vision || ""}

価値観:
${company.values || ""}

ブランドトーン:
${company.brandTone || "丁寧、誠実、専門的、わかりやすい"}

主なサービス:
${company.mainServices || ""}

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

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    const model = Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";

    if (!openaiApiKey) {
      return json({ error: "OPENAI_API_KEY is not set" }, 500);
    }

    // OpenAI Responses APIを呼び出す
    const openaiRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "companybrain_answer",
            strict: true,
            schema: {
              type: "object",
              properties: {
                answer: { type: "string" },
                confidence: { type: "number" },
                needHumanReview: { type: "boolean" },
                reason: { type: "string" },
                usedSourceIndexes: {
                  type: "array",
                  items: { type: "integer" },
                },
              },
              required: ["answer", "confidence", "needHumanReview", "reason", "usedSourceIndexes"],
              additionalProperties: false,
            },
          },
        },
      }),
    });

    if (!openaiRes.ok) {
      const detail = await openaiRes.text();
      return json({ error: "OpenAI API error", detail }, 500);
    }

    const openaiData = await openaiRes.json();
    const outputText = extractOutputText(openaiData);

    let parsed;
    try {
      parsed = JSON.parse(outputText);
    } catch (_error) {
      parsed = {
        answer: outputText || "回答生成結果の解析に失敗しました。担当者による確認が必要です。",
        confidence: 0.3,
        needHumanReview: true,
        reason: "OpenAI response JSON parse failed",
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

    return json({
      answer: parsed.answer,
      confidence,
      needHumanReview,
      reason: parsed.reason,
      usedSources,
      conversationLogId: log.id,
    });

  } catch (error) {
    return json({ error: error?.message || "Unexpected error" }, 500);
  }
});