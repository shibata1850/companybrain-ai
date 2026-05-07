import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SCOPE_ALLOWED_ROLES = {
  public: ["softdoing_admin", "client_admin", "editor", "employee", "executive", "viewer"],
  internal: ["softdoing_admin", "client_admin", "editor", "employee", "executive"],
  executive: ["softdoing_admin", "client_admin", "executive"],
  admin_only: ["softdoing_admin", "client_admin"],
};

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { question, channel, clientCompanyId, category } = await req.json();

  if (!question || !channel || !clientCompanyId) {
    return Response.json({ error: 'question, channel, clientCompanyId are required' }, { status: 400 });
  }

  const businessRole = user.businessRole || "viewer";

  const channelScopeMap = {
    public: "public",
    internal: "internal",
    executive: "executive",
    admin_test: "admin_only",
  };
  const requiredScope = channelScopeMap[channel];
  if (!requiredScope) return Response.json({ error: 'Invalid channel' }, { status: 400 });

  // admin_test は admin ロールのみ
  if (channel === "admin_test" && user.role !== "admin") {
    return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });
  }

  const allowedRoles = SCOPE_ALLOWED_ROLES[requiredScope] || [];
  if (!allowedRoles.includes(businessRole) && user.role !== "admin") {
    return Response.json({ error: 'Forbidden: role not allowed' }, { status: 403 });
  }

  const [knowledgeSources, knowledgeChunks, answerPolicies, companyProfiles] = await Promise.all([
    base44.asServiceRole.entities.KnowledgeSource.filter({ clientCompanyId, status: "approved" }),
    base44.asServiceRole.entities.KnowledgeChunk.filter({ clientCompanyId, status: "approved" }),
    base44.asServiceRole.entities.AnswerPolicy.filter({ clientCompanyId, status: "active" }),
    base44.asServiceRole.entities.CompanyProfile.filter({ clientCompanyId }),
  ]);

  // スコープフィルタリング
  const filteredSources = knowledgeSources.filter(k => isScopeAllowed(k.audienceScope, requiredScope));
  const filteredChunks = knowledgeChunks.filter(k => isScopeAllowed(k.audienceScope, requiredScope));

  // カテゴリフィルタリング（指定あれば）
  const categoryFilteredChunks = category
    ? filteredChunks.filter(c => c.category === category)
    : filteredChunks;
  const usedChunks = categoryFilteredChunks.length > 0 ? categoryFilteredChunks : filteredChunks;

  const company = companyProfiles?.[0];
  const policy = answerPolicies.find(p => p.audienceScope === requiredScope) || answerPolicies[0];
  const systemPrompt = policy?.systemPrompt || buildDefaultSystemPrompt(channel, company);

  let context = "";
  if (company) {
    context += `【会社情報】\n会社名: ${company.companyName}\n業種: ${company.industry || ""}\n概要: ${company.description || ""}\nサービス: ${company.services || ""}\n\n`;
  }
  if (usedChunks.length > 0) {
    context += "【ナレッジ】\n";
    usedChunks.slice(0, 20).forEach(c => {
      context += `[${c.title}] ${c.chunkText?.slice(0, 600) || ""}\n`;
    });
  } else if (filteredSources.length > 0) {
    context += "【ナレッジ】\n";
    filteredSources.slice(0, 10).forEach(s => {
      context += `[${s.title}] ${s.extractedText?.slice(0, 600) || s.summary || ""}\n`;
    });
  }

  const prompt = `${systemPrompt}\n\n${context}\n\n質問: ${question}`;

  const response = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt,
    response_json_schema: {
      type: "object",
      properties: {
        answer: { type: "string" },
        confidence: { type: "number" },
        needHumanReview: { type: "boolean" },
        usedSourceTitles: { type: "array", items: { type: "string" } },
      },
    },
  });

  // 会話ログを保存
  const logRecord = await base44.asServiceRole.entities.ConversationLog.create({
    clientCompanyId,
    userId: user.id,
    channel,
    question,
    answer: response.answer,
    confidence: response.confidence ?? null,
    needHumanReview: response.needHumanReview ?? false,
    usedSources: filteredSources.slice(0, 5).map(s => s.id),
    feedback: "none",
  });

  return Response.json({
    answer: response.answer,
    confidence: response.confidence ?? null,
    needHumanReview: response.needHumanReview ?? false,
    usedSourceTitles: response.usedSourceTitles || usedChunks.slice(0, 5).map(c => c.title),
    conversationLogId: logRecord.id,
  });
});

function isScopeAllowed(audienceScope, requiredScope) {
  const scopeOrder = ["public", "internal", "executive", "admin_only"];
  return scopeOrder.indexOf(audienceScope) <= scopeOrder.indexOf(requiredScope);
}

function buildDefaultSystemPrompt(channel, company) {
  const name = company?.companyName || "この会社";
  const prompts = {
    public: `あなたは${name}の公式AIアシスタントです。社外の顧客・パートナー向けに丁寧で信頼感のある回答をしてください。社内機密・内部情報は絶対に回答に含めないでください。`,
    internal: `あなたは${name}の社内向けアシスタントAIです。従業員向けに社内ルール、ナレッジ、業務手順について詳しく回答してください。`,
    executive: `あなたは${name}の経営者向けアドバイザーAIです。経営判断・戦略策定・リスク分析の観点から回答してください。`,
    admin_test: `これは管理者テストモードです。すべてのナレッジにアクセスして回答品質を確認できます。`,
  };
  return prompts[channel] || prompts.public;
}