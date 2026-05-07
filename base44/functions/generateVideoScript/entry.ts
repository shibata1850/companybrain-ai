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
      purpose,
      targetAudience,
      durationSeconds = 60,
      speakingStyle = "誠実"
    } = await req.json();

    const company = (await base44.asServiceRole.entities.ClientCompany.filter({
      id: clientCompanyId
    }))?.[0];

    if (!company) {
      return Response.json({ error: "Company not found" }, { status: 404 });
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
      return Response.json({
        error: "Feature not available",
        message: "Lightプランでは動画生成機能は利用できません。",
        limitExceeded: true,
      }, { status: 403 });
    }

    // 当月のAI回答数チェック（台本生成はAI回答数の上限も確認）
    const monthlyConversations = await base44.asServiceRole.entities.ConversationLog.filter({
      clientCompanyId,
    }).then(c => c.filter(x => x.created_date?.startsWith(currentMonth)));

    if (limits.aiAnswerLimitMonthly !== null && monthlyConversations.length >= limits.aiAnswerLimitMonthly) {
      return Response.json({
        error: "Usage limit exceeded",
        message: `月間AI回答数の上限（${limits.aiAnswerLimitMonthly}回答）に達しています。`,
        limitExceeded: true,
      }, { status: 429 });
    }

    // 当月の動画生成秒数をカウント
    const monthlyVideos = await base44.asServiceRole.entities.VideoProject.filter({
      clientCompanyId,
    }).then(v => v.filter(x => x.created_date?.startsWith(currentMonth) && x.status === "completed"));

    const totalVideoSeconds = monthlyVideos.reduce((sum, v) => sum + (v.durationSeconds || 0), 0);

    if (limits.videoSecondsLimitMonthly !== null && totalVideoSeconds >= limits.videoSecondsLimitMonthly) {
      return Response.json({
        error: "Usage limit exceeded",
        message: `月間動画生成時間の上限（${limits.videoSecondsLimitMonthly}秒）に達しています。`,
        limitExceeded: true,
      }, { status: 429 });
    }

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
      return Response.json({ error: "OpenAI error", detail: errorText }, { status: 500 });
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

    return Response.json({
      videoProjectId: videoProject.id,
      ...parsed
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});