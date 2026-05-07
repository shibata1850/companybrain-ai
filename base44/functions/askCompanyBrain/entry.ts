import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// チャンネルごとに参照できるスコープ（累積）
const CHANNEL_ALLOWED_SCOPES = {
  public: ["public"],
  internal: ["public", "internal"],
  executive: ["public", "internal", "executive"],
  admin_test: ["public", "internal", "executive", "admin_only"],
};

// ロールごとにアクセスできるチャンネル
const ROLE_ALLOWED_CHANNELS = {
  softdoing_admin: ["public", "internal", "executive", "admin_test"],
  client_admin: ["public", "internal", "executive", "admin_test"],
  executive: ["public", "internal", "executive"],
  editor: ["public", "internal"],
  employee: ["public", "internal"],
  viewer: ["public"],
};

function scoreChunk(question, chunk) {
  const q = question.toLowerCase();
  const text = [
    chunk.title || "",
    chunk.chunkText || "",
    Array.isArray(chunk.tags) ? chunk.tags.join(" ") : "",
    Array.isArray(chunk.keywords) ? chunk.keywords.join(" ") : "",
  ].join(" ").toLowerCase();

  const terms = q
    .replace(/[、。！？,.!?]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  let score = 0;
  for (const term of terms) {
    if (text.includes(term)) score += 1;
  }
  if (chunk.category && q.includes(String(chunk.category).toLowerCase())) score += 2;
  return score;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { clientCompanyId, question, channel = "internal", category = "" } = await req.json();

    if (!clientCompanyId || !question) {
      return Response.json({ error: "clientCompanyId and question are required" }, { status: 400 });
    }

    const allowedScopes = CHANNEL_ALLOWED_SCOPES[channel];
    if (!allowedScopes) {
      return Response.json({ error: "Invalid channel" }, { status: 400 });
    }

    // ロールチェック
    const businessRole = user.businessRole || user.role || "viewer";
    const isSoftdoingAdmin = businessRole === "softdoing_admin" || user.role === "admin";
    const allowedChannels = ROLE_ALLOWED_CHANNELS[businessRole] || ["public"];

    if (!isSoftdoingAdmin && !allowedChannels.includes(channel)) {
      return Response.json({ error: "Forbidden: role not allowed for this channel" }, { status: 403 });
    }

    // softdoing_admin 以外は自社データのみ
    // admin_test は admin ロールのみ
    if (channel === "admin_test" && user.role !== "admin") {
      return Response.json({ error: "Forbidden: admin only" }, { status: 403 });
    }

    // 会社・ポリシー・チャンクを並行取得
    const [companies, allChunks, policies] = await Promise.all([
      base44.asServiceRole.entities.ClientCompany.filter({ id: clientCompanyId }),
      base44.asServiceRole.entities.KnowledgeChunk.filter({ clientCompanyId, status: "approved" }),
      base44.asServiceRole.entities.AnswerPolicy.filter({ clientCompanyId, status: "active" }),
    ]);

    const company = companies?.[0];
    if (!company) {
      return Response.json({ error: "Company not found" }, { status: 404 });
    }

    // softdoing_admin 以外は自社のみ
    if (!isSoftdoingAdmin && company.id !== clientCompanyId) {
      return Response.json({ error: "Forbidden: company mismatch" }, { status: 403 });
    }

    // スコープとカテゴリでフィルタリング
    const permittedChunks = allChunks.filter((chunk) => {
      const scopeOk = allowedScopes.includes(chunk.audienceScope);
      const categoryOk = category ? chunk.category === category : true;
      return scopeOk && categoryOk;
    });

    // スコアリングしてトップ12件を選択
    const topChunks = permittedChunks
      .map((chunk) => ({ ...chunk, _score: scoreChunk(question, chunk) }))
      .sort((a, b) => b._score - a._score)
      .slice(0, 12);

    // チャンネルに対応するポリシーを取得
    const policy = policies.find((p) => p.audienceScope === channel) || policies[0];

    // 参照情報テキスト生成
    const sourcesText = topChunks.length > 0
      ? topChunks.map((chunk, index) =>
          `【Source ${index + 1}】\nタイトル: ${chunk.title}\nカテゴリ: ${chunk.category || ""}\n公開範囲: ${chunk.audienceScope}\n内容:\n${chunk.chunkText}`
        ).join("\n\n")
      : "該当する参照情報は見つかりませんでした。";

    // システムプロンプト生成
    const systemPrompt = buildSystemPrompt(channel, company, policy);
    const userPrompt = `ユーザー質問:\n${question}\n\n参照情報:\n${sourcesText}`;
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

    // OpenAI API 呼び出し
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      return Response.json({ error: "OPENAI_API_KEY is not set" }, { status: 500 });
    }

    const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o";

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
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
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!openaiRes.ok) {
      const errorText = await openaiRes.text();
      return Response.json({ error: "OpenAI API error", detail: errorText }, { status: 500 });
    }

    const openaiData = await openaiRes.json();
    const outputText = openaiData.choices?.[0]?.message?.content || "{}";

    let parsed;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      parsed = {
        answer: outputText,
        confidence: 0.5,
        needHumanReview: true,
        reason: "JSON parse failed",
        usedSourceIndexes: [],
      };
    }

    // 使用ソースの解決（1-indexedに対応）
    const usedSources = (parsed.usedSourceIndexes || [])
      .map((i) => topChunks[i - 1])
      .filter(Boolean)
      .map((chunk) => ({
        title: chunk.title,
        knowledgeSourceId: chunk.knowledgeSourceId,
        chunkId: chunk.id,
        audienceScope: chunk.audienceScope,
      }));

    // 会話ログ保存
    const log = await base44.asServiceRole.entities.ConversationLog.create({
      clientCompanyId,
      userId: user.id,
      channel,
      question,
      answer: parsed.answer,
      usedSources: usedSources.map((s) => s.chunkId),
      confidence: parsed.confidence ?? null,
      needHumanReview: parsed.needHumanReview ?? false,
      feedback: "none",
    });

    return Response.json({
      answer: parsed.answer,
      confidence: parsed.confidence ?? null,
      needHumanReview: parsed.needHumanReview ?? false,
      reason: parsed.reason || "",
      usedSources,
      conversationLogId: log.id,
    });

  } catch (error) {
    return Response.json({ error: error.message || "Unexpected error" }, { status: 500 });
  }
});

function buildSystemPrompt(channel, company, policy) {
  const name = company?.companyName || "この会社";
  const overview = company?.companyOverview || "";
  const mission = company?.mission || "";
  const values = company?.values || "";
  const brandTone = company?.brandTone || "丁寧、誠実、専門的、わかりやすい";

  const channelRules = {
    public: "社外の顧客・パートナー向けに回答します。社内情報・経営判断・未公開情報は絶対に回答に含めないでください。",
    internal: "社内の従業員向けに回答します。実務に役立つように具体的に答えてください。",
    executive: "経営者向けに回答します。判断材料・リスク・選択肢を整理して伝えてください。",
    admin_test: "管理者テストモードです。すべてのナレッジにアクセスして回答品質を確認できます。",
  };

  return `あなたは「CompanyBrain AI」です。
${name}の知識・理念・判断基準をもとに、会社らしい言葉で回答するAIです。

会社名: ${name}
会社概要: ${overview}
ミッション: ${mission}
価値観: ${values}
ブランドトーン: ${brandTone}

回答対象: ${channel}
${channelRules[channel] || channelRules.public}

共通ルール:
- 必ず提供された参照情報（Source）を根拠に回答する
- 参照情報にないことは断定しない
- 不明な場合は「確認が必要です」と伝える
- 法務・税務・労務・医療など専門判断が必要な場合は専門家への確認を促す
- 回答は自然な日本語で、会社らしい丁寧な口調にする
- usedSourceIndexes には実際に参照した Source 番号（1始まり）を入れる
- confidence は 0.0〜1.0 で回答の確信度を示す
- needHumanReview は専門判断・機密性・リスクが高い場合に true にする

${policy?.systemPrompt ? `追加ポリシー:\n${policy.systemPrompt}` : ""}
${policy?.forbiddenTopics ? `禁止事項:\n${policy.forbiddenTopics}` : ""}
${policy?.escalationRules ? `エスカレーション条件:\n${policy.escalationRules}` : ""}
${policy?.disclaimerText ? `免責事項:\n${policy.disclaimerText}` : ""}`.trim();
}