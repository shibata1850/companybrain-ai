import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// audienceScope と businessRole の対応表
const SCOPE_ALLOWED_ROLES = {
  public: ["softdoing_admin", "client_admin", "editor", "employee", "executive", "viewer"],
  internal: ["softdoing_admin", "client_admin", "editor", "employee"],
  executive: ["softdoing_admin", "client_admin", "executive"],
  admin_only: ["softdoing_admin", "client_admin"],
};

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { question, channel, clientCompanyId } = await req.json();

  if (!question || !channel || !clientCompanyId) {
    return Response.json({ error: 'question, channel, clientCompanyId are required' }, { status: 400 });
  }

  const businessRole = user.businessRole || "viewer";

  // channel → audienceScope のマッピング
  const channelScopeMap = {
    public: "public",
    internal: "internal",
    executive: "executive",
    admin_test: "admin_only",
  };
  const requiredScope = channelScopeMap[channel];
  if (!requiredScope) {
    return Response.json({ error: 'Invalid channel' }, { status: 400 });
  }

  // businessRole がそのスコープにアクセス可能か検証
  const allowedRoles = SCOPE_ALLOWED_ROLES[requiredScope] || [];
  if (!allowedRoles.includes(businessRole)) {
    return Response.json({ error: 'Forbidden: your role does not have access to this channel' }, { status: 403 });
  }

  // softdoing_admin は全企業アクセス可。それ以外は自社のみ
  if (businessRole !== "softdoing_admin" && user.clientCompanyId !== clientCompanyId) {
    return Response.json({ error: 'Forbidden: company mismatch' }, { status: 403 });
  }

  // Service Role でナレッジを取得（フロントエンドには公開しない）
  const allowedScopes = SCOPE_ALLOWED_ROLES[requiredScope]
    ? getScopesForRole(businessRole)
    : ["public"];

  const [knowledgeSources, knowledgeChunks, answerPolicies, companyProfiles] = await Promise.all([
    base44.asServiceRole.entities.KnowledgeSource.filter({
      clientCompanyId,
      status: "approved",
    }),
    base44.asServiceRole.entities.KnowledgeChunk.filter({
      clientCompanyId,
      status: "approved",
    }),
    base44.asServiceRole.entities.AnswerPolicy.filter({
      clientCompanyId,
      audienceScope: requiredScope === "admin_only" ? undefined : requiredScope,
      status: "active",
    }),
    base44.asServiceRole.entities.CompanyProfile.filter({ clientCompanyId }),
  ]);

  // スコープフィルタリング（publicチャンネルはpublicデータのみ）
  const filteredSources = knowledgeSources.filter(k =>
    isAudienceAllowed(k.audienceScope, businessRole)
  );
  const filteredChunks = knowledgeChunks.filter(k =>
    isAudienceAllowed(k.audienceScope, businessRole)
  );

  // コンテキスト構築
  const company = companyProfiles?.[0];
  let context = "";
  if (company) {
    context += `【会社情報】\n会社名: ${company.companyName}\n業種: ${company.industry || ""}\n概要: ${company.description || ""}\nサービス: ${company.services || ""}\n\n`;
  }

  const policy = answerPolicies?.[0];
  const systemPrompt = policy?.systemPrompt ||
    buildDefaultSystemPrompt(channel, company);

  if (filteredChunks.length > 0) {
    context += "【ナレッジ】\n";
    filteredChunks.slice(0, 20).forEach(c => {
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
      },
    },
  });

  // 会話ログを保存
  await base44.asServiceRole.entities.ConversationLog.create({
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
    confidence: response.confidence,
    needHumanReview: response.needHumanReview,
  });
});

function isAudienceAllowed(audienceScope, businessRole) {
  const allowed = SCOPE_ALLOWED_ROLES[audienceScope] || [];
  return allowed.includes(businessRole);
}

function getScopesForRole(businessRole) {
  const scopes = [];
  for (const [scope, roles] of Object.entries(SCOPE_ALLOWED_ROLES)) {
    if (roles.includes(businessRole)) scopes.push(scope);
  }
  return scopes;
}

function buildDefaultSystemPrompt(channel, company) {
  const name = company?.companyName || "この会社";
  const prompts = {
    public: `あなたは${name}の公式AIアシスタントです。社外の顧客・パートナー向けに丁寧で信頼感のある回答をしてください。社内機密・内部情報は絶対に回答に含めないでください。`,
    internal: `あなたは${name}の社内向けアシスタントAIです。従業員向けに社内ルール、ナレッジ、業務手順について詳しく回答してください。`,
    executive: `あなたは${name}の経営者向けアドバイザーAIです。経営判断・戦略策定・リスク分析の観点から回答してください。`,
    admin_test: `これは管理者テストモードです。すべてのナレッジにアクセスして回答します。`,
  };
  return prompts[channel] || prompts.public;
}