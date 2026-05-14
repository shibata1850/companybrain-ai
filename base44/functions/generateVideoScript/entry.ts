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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return jsonError("unauthorized", "認証が必要です。ログインしてください。", 401);
    }

    const {
      clientCompanyId,
      purpose,
      targetAudience,
      durationSeconds = 60,
      speakingStyle = "誠実"
    } = await req.json();

    if (!clientCompanyId) {
      return jsonError("invalid_request", "clientCompanyId is required", 400);
    }

    // テナント分離: asServiceRole を使う前に必ずチェック
    const tenant = assertTenantAccess(user, clientCompanyId);
    if (!tenant.allowed) {
      return jsonError(tenant.errorType, tenant.message, 403);
    }

    const company = (await base44.asServiceRole.entities.ClientCompany.filter({
      id: clientCompanyId
    }))?.[0];

    if (!company) {
      return jsonError("company_not_found", "ClientCompany が見つかりません。", 404);
    }

    // 利用制限チェック
    const PLAN_LIMITS = {
      Light: { aiAnswerLimitMonthly: 1000, videoSecondsLimitMonthly: 0 },
      Standard: { aiAnswerLimitMonthly: 5000, videoSecondsLimitMonthly: 600 },
      Professional: { aiAnswerLimitMonthly: 20000, videoSecondsLimitMonthly: 1800 },
      Enterprise: { aiAnswerLimitMonthly: null, videoSecondsLimitMonthly: null },
    };

    const planName = company.planName || "Light";
    const limits = PLAN_LIMITS[planName] || PLAN_LIMITS.Light;
    const currentMonth = new Date().toISOString().slice(0, 7);

    // Lightプランでは動画生成をブロック
    if (limits.videoSecondsLimitMonthly === 0) {
      return jsonError(
        "plan_not_allowed",
        "Lightプランでは動画生成機能は利用できません。",
        403,
        { planName, limitExceeded: true }
      );
    }

    // 当月のAI回答数チェック（台本生成はAI回答数の上限も確認）
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

    // 台本生成の利用制限チェック
    const scriptLimits = {
     Light: { scriptGenerationMonthly: null },
     Standard: { scriptGenerationMonthly: 20 },
     Professional: { scriptGenerationMonthly: 50 },
     Enterprise: { scriptGenerationMonthly: null },
    };

    const scriptLimit = scriptLimits[planName]?.scriptGenerationMonthly;
    if (scriptLimit !== null) {
     const monthlyScripts = await base44.asServiceRole.entities.VideoProject.filter({
       clientCompanyId,
     }).then(v => v.filter(x => x.created_date?.startsWith(currentMonth) && x.scriptStatus === "approved"));

     if (monthlyScripts.length >= scriptLimit) {
       return jsonError(
         "usage_limit_exceeded",
         `月間台本生成数の上限（${scriptLimit}回）に達しています。`,
         429,
         { planName, used: monthlyScripts.length, limit: scriptLimit }
       );
     }
    }

    // 当月の動画生成秒数をカウント
    const monthlyVideos = await base44.asServiceRole.entities.VideoProject.filter({
     clientCompanyId,
    }).then(v => v.filter(x => x.created_date?.startsWith(currentMonth) && x.status === "completed"));

    const totalVideoSeconds = monthlyVideos.reduce((sum, v) => sum + (v.durationSeconds || 0), 0);

    if (limits.videoSecondsLimitMonthly !== null && totalVideoSeconds >= limits.videoSecondsLimitMonthly) {
     return jsonError(
       "usage_limit_exceeded",
       `月間動画生成時間の上限（${limits.videoSecondsLimitMonthly}秒）に達しています。`,
       429,
       { planName, used: totalVideoSeconds, limit: limits.videoSecondsLimitMonthly }
     );
    }

    // 台本は社外向けの参照のみ許可（admin_only / executive / internal は流入させない）
    const chunks = await base44.asServiceRole.entities.KnowledgeChunk.filter({
      clientCompanyId,
      status: "approved",
      audienceScope: "public"
    });

    const knowledgeText = chunks.slice(0, 20).map((c) => {
      return `- ${c.title}: ${c.chunkText}`;
    }).join("\n");

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o";

    if (!openaiApiKey) {
      return jsonError("missing_openai_key", "OPENAI_API_KEY が設定されていません。", 500);
    }

    const prompt = `
あなたは日本語の動画台本作成者です。
CompanyBrain AIの動画用に、自然な日本語の話し言葉で台本を作成してください。

会社名:
${company.companyName}

会社概要:
${company.companyOverview}

理念:
${company.mission}

価値観:
${company.values}

主なサービス:
${company.mainServices}

参照ナレッジ:
${knowledgeText}

動画目的:
${purpose}

対象者:
${targetAudience}

希望尺:
${durationSeconds}秒

話し方:
${speakingStyle}

条件:
- 一文を短くする
- 音声で聞きやすい日本語にする
- 専門用語はわかりやすくする
- 会社らしい誠実な印象にする
- 冒頭で興味を引く
- 最後に行動を促す
`;

    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: prompt,
        text: {
          format: {
            type: "json_schema",
            name: "video_script",
            strict: true,
            schema: {
              type: "object",
              properties: {
                title: { type: "string" },
                script: { type: "string" },
                estimatedDurationSeconds: { type: "number" },
                notes: { type: "string" }
              },
              required: ["title", "script", "estimatedDurationSeconds", "notes"],
              additionalProperties: false
            }
          }
        }
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      return jsonError("openai_api_error", "OpenAI APIの呼び出しに失敗しました。", 502, { status: res.status, detail: errorText });
    }

    const data = await res.json();
    const outputText =
      data.output_text ||
      data.output?.[0]?.content?.[0]?.text ||
      "{}";

    const parsed = JSON.parse(outputText);

    const videoProject = await base44.asServiceRole.entities.VideoProject.create({
     clientCompanyId,
     title: parsed.title,
     purpose,
     script: parsed.script,
     scriptStatus: "draft",
     status: "script_ready",
     durationSeconds: parsed.estimatedDurationSeconds
    });

    // UsageRecord に保存
    await base44.asServiceRole.entities.UsageRecord.create({
     clientCompanyId,
     usageType: "script_generation",
     provider: "openai",
     units: 1,
     unitName: "script",
     estimatedCostUsd: 0,
     metadata: JSON.stringify({
       videoProjectId: videoProject.id,
       purpose,
       targetAudience,
     }),
    });

    return Response.json({
     videoProjectId: videoProject.id,
     ...parsed
    });

  } catch (error) {
    console.error("[generateVideoScript] Unexpected error:", error?.message, error?.stack);
    return jsonError("unexpected_error", error?.message || "Unexpected error", 500, { stack: error?.stack || null });
  }
});
