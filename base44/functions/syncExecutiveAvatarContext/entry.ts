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

function normalizeText(value) {
  return String(value || "").trim();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return jsonError("unauthorized", "認証が必要です。ログインしてください。", 401);
    }

    const { clientCompanyId, avatarProfileId } = await req.json();

    if (!clientCompanyId) return jsonError("invalid_request", "clientCompanyId is required", 400);
    if (!avatarProfileId) return jsonError("invalid_request", "avatarProfileId is required", 400);

    // テナント分離: asServiceRole を使う前に必ずチェック
    const tenant = assertTenantAccess(user, clientCompanyId);
    if (!tenant.allowed) {
      return jsonError(tenant.errorType, tenant.message, 403);
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

    if (profile.consentStatus !== "approved") {
      return jsonError(
        "consent_not_approved",
        "consentStatus = approved である必要があります。",
        403
      );
    }

    // 会社情報取得
    const company = await base44.asServiceRole.entities.ClientCompany.get(clientCompanyId);
    if (!company) {
      return jsonError("company_not_found", "ClientCompany が見つかりません。", 404);
    }

    // AnswerPolicy取得
    const policies = await base44.asServiceRole.entities.AnswerPolicy.filter({
      clientCompanyId,
      status: "active",
    });
    const policy = policies[0] || null;

    // KnowledgeChunk取得（approved のみ）
    const allChunks = await base44.asServiceRole.entities.KnowledgeChunk.filter({
      clientCompanyId,
      status: "approved",
    });

    // audienceScope でフィルタリング（admin_only は softdoing_admin のみ）
    const scopesToUse = knowledgeScopesForAudience(profile.audienceScope, isGlobalAdmin(user));
    const filteredChunks = allChunks.filter(c => scopesToUse.includes(c.audienceScope));

    // Context Promptを整形
    const contextPrompt = `
【ExecutiveBrain Avatar Context】

会社名：${company.companyName}

会社概要：
${normalizeText(company.companyOverview)}

理念・ミッション：
${normalizeText(company.mission)}

ビジョン：
${normalizeText(company.vision)}

価値観：
${normalizeText(company.values)}

主なサービス：
${normalizeText(company.mainServices)}

代表者・アバター役割：
${normalizeText(profile.roleDescription)}

話し方ガイド：
${normalizeText(policy?.toneGuide || "丁寧、誠実、専門的")}

判断スタイル：
${normalizeText(policy?.systemPrompt || "")}

会社方針：
${normalizeText(policy?.disclaimerText || "")}

新人研修方針：
教育的で、実務的で、会社文化を伝える。

顧客対応方針：
丁寧で、信頼感があり、前向きな姿勢。

禁止事項：
${normalizeText(policy?.forbiddenTopics || "")}

エスカレーション条件：
${normalizeText(policy?.escalationRules || "")}

【重要な免責】
- このアバターはAIです。本人そのものではありません。
- 最終的な判断・決定は人間が行います。
- 重要な契約や人事判断は専門家に相談してください。

【参照ナレッジ】
${filteredChunks.map((c, i) => `${i + 1}. ${c.title}: ${c.chunkText}`).join("\n")}
`.trim();

    // Gemini で Context Prompt をさらに整形
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const geminiModel = Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash";

    if (!geminiKey) {
      return jsonError("missing_gemini_key", "GEMINI_API_KEY が設定されていません。", 500);
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [{
              text: `以下の情報をLiveAvatar用のContext Promptとして整形してください。簡潔で、実行的で、アバターが一貫した判断ができるように。\n\n${contextPrompt}`,
            }],
          }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties: {
                contextPrompt: { type: "string" },
              },
            },
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const detail = await geminiRes.text();
      return jsonError("gemini_api_error", "Context Promptの整形に失敗しました。", 502, { status: geminiRes.status, detail });
    }

    const geminiData = await geminiRes.json();
    const finalPrompt = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || contextPrompt;

    // LiveAvatar API で Context を作成/更新
    const liveAvatarKey = Deno.env.get("LIVEAVATAR_API_KEY");

    let contextId = profile.liveAvatarContextId;
    let liveAvatarUsed = false;

    if (liveAvatarKey) {
      try {
        const method = contextId ? "PUT" : "POST";
        const endpoint = contextId
          ? `https://api.liveavatar.com/contexts/${contextId}`
          : "https://api.liveavatar.com/contexts";

        const laRes = await fetch(endpoint, {
          method,
          headers: {
            "X-API-KEY": liveAvatarKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: `${company.companyName} - ${profile.avatarName}`,
            prompt: finalPrompt,
            scope: profile.audienceScope,
          }),
        });

        if (laRes.ok) {
          const laData = await laRes.json();
          contextId = laData.context_id || laData.id || contextId;
          liveAvatarUsed = true;
        }
      } catch (_e) {
        // LiveAvatar失敗時は続行
      }
    }

    // プロファイル更新
    if (liveAvatarUsed && contextId) {
      await base44.asServiceRole.entities.ExecutiveAvatarProfile.update(avatarProfileId, {
        liveAvatarContextId: contextId,
      });
    }

    // UsageRecord に記録
    await base44.asServiceRole.entities.UsageRecord.create({
      clientCompanyId,
      usageType: "avatar_context_sync",
      provider: liveAvatarUsed ? "liveavatar" : "gemini",
      units: 1,
      unitName: "sync",
      estimatedCostUsd: 0,
      metadata: JSON.stringify({ avatarProfileId, contextId }),
    });

    return Response.json({
      success: true,
      contextId,
      message: liveAvatarUsed
        ? "ExecutiveAvatarのContext が同期されました。"
        : "Geminiでのみ整形されました。LiveAvatarへの同期に失敗しましたが、Context Promptは生成されています。",
    });
  } catch (error) {
    console.error("[syncExecutiveAvatarContext] Unexpected error:", error?.message, error?.stack);
    return jsonError("unexpected_error", error?.message || "Unexpected error", 500, { stack: error?.stack || null });
  }
});
